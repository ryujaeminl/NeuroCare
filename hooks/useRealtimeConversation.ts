"use client";

import { useEffect, useRef, useState } from "react";
import type {
  ConversationLogEntry,
  ConversationPhase,
  UseConversationEngineResult,
} from "@/hooks/useConversationEngine";

declare global {
  interface Window {
    Android?: { closeApp?: () => void };
  }
}

// hooks/useConversationEngine.ts의 END_CONVERSATION_PATTERN과 글자 하나 다르지 않게 복사.
// 이 훅 하나에서만 쓰고 기존 훅은 곧 삭제될 예정이라 공유 모듈로 뽑지 않는다.
const END_CONVERSATION_PATTERN =
  /^(대화종료|이제그만|그만할래|그만하자|끝낼래|끝내자|잘자|잘자요|안녕히주무세요|주무세요)[.!?~,]*$/;

/** Azure Realtime data channel이 보내는 서버 이벤트 중 이 훅이 실제로 쓰는 필드만 타입화한다. */
interface RealtimeServerEvent {
  type: string;
  delta?: string;
  transcript?: string;
  error?: { message?: string };
}

export function useRealtimeConversation(): UseConversationEngineResult {
  const [phase, setPhase] = useState<ConversationPhase>("listening");
  const [assistantDraft, setAssistantDraft] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [log, setLog] = useState<ConversationLogEntry[]>([]);
  const [vadListening, setVadListening] = useState(false);
  const [vadUserSpeaking, setVadUserSpeaking] = useState(false);
  const [vadError, setVadError] = useState<string | null>(null);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const startedRef = useRef(false);

  // 페이지 마운트 시 한 번 연결 - 기존 useConversationEngine이 마운트 시 vad.start()를
  // 부르던 것과 동일한 타이밍(app/page.tsx는 이 훅을 호출만 하면 된다). startedRef 가드가
  // 있어 StrictMode의 effect 2회 실행에도 안전하다. connect를 effect 밖 useCallback으로
  // 빼지 않고 effect 안에 두는 이유: hooks/useLinkedPatients.ts와 같은 패턴(effect-local
  // async 함수) - react-hooks/set-state-in-effect가 "effect 밖 콜백을 의존성으로 불러
  // 그 안에서 setState" 모양을 정적으로 문제 삼는다.
  useEffect(() => {
    async function connect() {
      if (startedRef.current) return;
      startedRef.current = true;

      let tokenRes: Response;
      try {
        tokenRes = await fetch("/api/realtime/token");
      } catch {
        setErrorMsg("네트워크 연결을 확인해주세요.");
        startedRef.current = false;
        return;
      }
      if (!tokenRes.ok) {
        setErrorMsg("지금은 대화를 시작할 수 없어요.");
        startedRef.current = false;
        return;
      }
      const { token, resource } = (await tokenRes.json()) as { token: string; resource: string };

      const pc = new RTCPeerConnection();
      peerConnectionRef.current = pc;
      // "연결 성공 후 true, 연결 전/종료 후 false"를 이 이벤트 한 곳에서만 결정한다 - 연결이
      // 붙은 뒤 네트워크 등으로 끊기는 경우까지 반영하려면 연결 직후 한 번만 true로 두는
      // 것으론 부족하다.
      pc.onconnectionstatechange = () => {
        setVadListening(pc.connectionState === "connected");
      };

      const audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      document.body.appendChild(audioEl);
      audioElRef.current = audioEl;
      pc.ontrack = (event) => {
        audioEl.srcObject = event.streams[0];
      };

      let mic: MediaStream;
      try {
        mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        setVadError(err instanceof Error ? err.message : "마이크 접근 실패");
        startedRef.current = false;
        return;
      }
      micStreamRef.current = mic;
      pc.addTrack(mic.getAudioTracks()[0]);

      const dataChannel = pc.createDataChannel("realtime-channel");
      dataChannel.addEventListener("message", (event) => {
        const e = JSON.parse(event.data as string) as RealtimeServerEvent;
        switch (e.type) {
          case "input_audio_buffer.speech_started":
            setPhase("transcribing");
            setVadUserSpeaking(true);
            break;
          case "input_audio_buffer.speech_stopped":
            setVadUserSpeaking(false);
            setPhase("thinking");
            break;
          case "output_audio_buffer.started":
            setPhase("speaking");
            break;
          case "output_audio_buffer.stopped":
            setPhase("listening");
            setAssistantDraft("");
            break;
          case "response.output_audio_transcript.delta":
            setAssistantDraft((prev) => prev + (e.delta ?? ""));
            break;
          case "response.output_audio_transcript.done":
            setLog((prev) => [{ id: Date.now(), role: "assistant", text: e.transcript ?? "" }, ...prev]);
            break;
          case "conversation.item.input_audio_transcription.completed": {
            const transcript: string = e.transcript ?? "";
            setLog((prev) => [{ id: Date.now(), role: "user", text: transcript }, ...prev]);
            void fetch("/api/realtime/distress-check", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ text: transcript }),
            });
            if (END_CONVERSATION_PATTERN.test(transcript.trim().replace(/\s+/g, ""))) {
              window.Android?.closeApp?.();
            }
            break;
          }
          case "error":
            setErrorMsg(e.error?.message ?? "오류가 발생했습니다.");
            break;
        }
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpRes = await fetch(`https://${resource}.openai.azure.com/openai/v1/realtime/calls?webrtcfilter=on`, {
        method: "POST",
        body: offer.sdp,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/sdp" },
      });
      if (!sdpRes.ok) {
        setErrorMsg("지금은 대화를 시작할 수 없어요.");
        startedRef.current = false;
        return;
      }
      const answerSdp = await sdpRes.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
    }

    void connect();
    return () => {
      peerConnectionRef.current?.close();
      // pc.close()는 마이크 트랙을 멈추지 않는다(WebRTC 스펙) - 그대로 두면 훅이 언마운트된
      // 뒤에도 브라우저 마이크 사용중 표시가 계속 떠 있는다.
      micStreamRef.current?.getTracks().forEach((track) => track.stop());
      audioElRef.current?.remove();
    };
  }, []);

  return {
    phase,
    interimText: "",
    assistantDraft,
    errorMsg,
    log,
    vadListening,
    vadUserSpeaking,
    vadError,
    photo: null,
    dismissPhoto: () => {},
  };
}
