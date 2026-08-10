"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * server/main.py의 /ws/transcribe(WebSocket 스트리밍 전사)를 감싼다. 발화가 끝나길
 * 기다렸다가 오디오를 통째로 업로드하는 기존 방식(handleSpeechSegment의 transcribeSegment)과
 * 달리, 말하는 도중 오디오 조각을 실시간으로 흘려보내 서버가 미리 받아두게 한다 - 발화가
 * 끝났을 때는 이미 대부분 도착해 있어 "끝→업로드→전사" 왕복 중 업로드 구간이 사실상 사라진다.
 *
 * 연결 실패/타임아웃 시 호출부가 기존 업로드 경로로 폴백할 수 있게 ready=false와 null을
 * 돌려준다 - 이 훅 자체는 재연결을 시도하지 않는다(세션당 한 번 연결해보고, 안 되면 그
 * 세션은 계속 폴백 경로를 쓴다 - hooks/useConversationEngine.ts의 DIRECT_BACKEND_URL과
 * 같은 "빠른 경로 우선, 실패하면 조용히 안전한 경로로" 철학).
 */

const FINAL_TIMEOUT_MS = 8000;

export interface UseStreamingSttResult {
  /** 지금 이 순간 발화를 스트리밍으로 보낼 수 있는 상태인지(WS 연결됨) */
  ready: boolean;
  /** 새 발화 시작을 서버에 알린다. sessionId는 서버가 이 대화에서 처음 들린 목소리를
   * 기준으로 다른 화자(TV/다른 가족)를 거르는 데 쓴다(server/speaker.py의
   * check_session_speaker_array, HTTP 업로드 경로의 session_id와 동일한 역할).
   * ready가 아니면 아무 일도 안 한다(호출부가 폴백해야 함). */
  startUtterance: (sessionId: string) => void;
  /** 발화 중 오디오 프레임 하나(16kHz mono Float32Array)를 보낸다. */
  sendFrame: (frame: Float32Array) => void;
  /** 발화 종료를 알리고 서버의 최종 전사 결과를 기다린다. 연결이 없거나, 타임아웃되거나,
   * 서버가 오류를 보내면 null(호출부가 기존 업로드 경로로 폴백). */
  endUtterance: () => Promise<string | null>;
}

/** wsUrl이 null이면(직접 백엔드 주소를 모르거나 스트리밍을 원치 않으면) 연결을 시도하지 않고
 * 항상 ready=false를 유지한다 - 호출부는 이 경우 기존 업로드 경로만 쓰면 된다. */
export function useStreamingStt(wsUrl: string | null): UseStreamingSttResult {
  const [ready, setReady] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const pendingFinalRef = useRef<{
    resolve: (text: string | null) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);

  const settlePending = useCallback((text: string | null) => {
    const pending = pendingFinalRef.current;
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingFinalRef.current = null;
    pending.resolve(text);
  }, []);

  useEffect(() => {
    if (!wsUrl) return;

    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = () => setReady(true);
    ws.onclose = () => setReady(false);
    ws.onerror = () => setReady(false);
    ws.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      try {
        const payload = JSON.parse(event.data) as { type?: string; text?: string };
        if (payload.type === "final") settlePending(payload.text ?? "");
        else if (payload.type === "error") settlePending(null);
        // partial은 지금은 쓰지 않는다(최종 결과만 필요) - 필요해지면 콜백을 추가한다.
      } catch {
        // 파싱 실패한 메시지는 무시한다.
      }
    };

    return () => {
      settlePending(null);
      ws.close();
      wsRef.current = null;
      setReady(false);
    };
  }, [wsUrl, settlePending]);

  const startUtterance = useCallback((sessionId: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "start", session_id: sessionId }));
  }, []);

  const sendFrame = useCallback((frame: Float32Array) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const pcm16 = new Int16Array(frame.length);
    for (let i = 0; i < frame.length; i++) {
      const clamped = Math.max(-1, Math.min(1, frame[i]));
      pcm16[i] = clamped < 0 ? clamped * 32768 : clamped * 32767;
    }
    ws.send(pcm16.buffer);
  }, []);

  const endUtterance = useCallback((): Promise<string | null> => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return Promise.resolve(null);

    return new Promise<string | null>((resolve) => {
      // 직전에 못 끝난 대기가 남아있으면(비정상 상황) 먼저 정리한다.
      settlePending(null);
      const timer = setTimeout(() => settlePending(null), FINAL_TIMEOUT_MS);
      pendingFinalRef.current = { resolve, timer };
      ws.send(JSON.stringify({ type: "end" }));
    });
  }, [settlePending]);

  return { ready, startUtterance, sendFrame, endUtterance };
}
