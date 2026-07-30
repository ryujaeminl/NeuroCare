"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MicVAD } from "@ricky0123/vad-web";

/** vad-web이 onSpeechEnd로 넘겨주는 오디오의 고정 샘플레이트 */
export const VAD_SAMPLE_RATE = 16000;

export interface UseVADResult {
  /** VAD가 마이크를 듣고 있는지 여부 */
  listening: boolean;
  /** 현재 프레임에서 발화가 감지되었는지 여부 (시각적 인디케이터용) */
  userSpeaking: boolean;
  error: string | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

/** 발화 도중 몇 ms마다 지금까지 녹음된 오디오를 partial STT용으로 내보낼지. */
const PARTIAL_CHUNK_MS = 1500;

/**
 * Silero VAD(@ricky0123/vad-web)를 감싸는 훅.
 * onSpeechSegment은 발화 구간이 끝날 때마다 그 구간의 오디오(16kHz mono Float32Array)를 넘겨준다
 * - 대기 화면의 웨이크워드 감지, 2단계 턴 종료 판단 등에서 재사용한다.
 * onPartialAudio는 "아직 말하는 중"인 동안에도 PARTIAL_CHUNK_MS마다 그때까지 녹음된
 * 오디오(webm/opus Blob, 누적본)를 실시간 자막용으로 넘겨준다 - 최종 확정 텍스트는
 * 여전히 onSpeechEnd 쪽이 담당하고, 이건 화면에 보여주는 미리보기 용도다.
 * vad-web이 내부적으로 만드는 마이크 스트림을 MediaRecorder가 그대로 재사용한다
 * (별도 getUserMedia를 또 열면 이 프로젝트에서 여러 번 겪은 마이크 충돌이 재발할 수 있다).
 */
export function useVAD(
  onSpeechSegment?: (audio: Float32Array) => void,
  onPartialAudio?: (blob: Blob) => void,
): UseVADResult {
  const [listening, setListening] = useState(false);
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const vadRef = useRef<MicVAD | null>(null);
  // MicVAD.new()는 비동기라, 그게 끝나기 전에 start()가 한 번 더 불리면 vadRef.current가
  // 아직 null이라 아래 가드를 통과해버려 VAD 인스턴스가 두 개 생길 수 있다 - 그럼 같은
  // 발화를 두 인스턴스가 각각 감지해 STT/응답이 통째로 두 번 돈다(실사용에서 확인된 버그).
  // 비동기 구간 전체를 이 플래그로 막아 재진입을 원천 차단한다.
  const startingRef = useRef(false);
  const onSpeechSegmentRef = useRef(onSpeechSegment);
  useEffect(() => {
    onSpeechSegmentRef.current = onSpeechSegment;
  }, [onSpeechSegment]);
  const onPartialAudioRef = useRef(onPartialAudio);
  useEffect(() => {
    onPartialAudioRef.current = onPartialAudio;
  }, [onPartialAudio]);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startPartialRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || !onPartialAudioRef.current) return;
    if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) return;

    chunksRef.current = [];
    const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
    recorder.ondataavailable = (event) => {
      if (event.data.size === 0) return;
      chunksRef.current.push(event.data);
      onPartialAudioRef.current?.(new Blob(chunksRef.current, { type: "audio/webm" }));
    };
    recorder.start(PARTIAL_CHUNK_MS);
    recorderRef.current = recorder;
  }, []);

  const stopPartialRecording = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  const start = useCallback(async () => {
    if (vadRef.current || startingRef.current) return;
    startingRef.current = true;
    setError(null);

    // 안드로이드 앱에서는 화면 전환 직후 백그라운드 웨이크워드 서비스가 마이크를 놓아주는
    // 시점과 여기서 잡으려는 시점이 살짝 겹칠 수 있다 - 그 찰나엔 마이크가 아직 다른
    // 프로세스에 물려있어 NotReadableError가 난다. 이건 곧 풀리는 일시적 상태라 재시도한다.
    const MAX_ATTEMPTS = 4;
    const RETRY_DELAY_MS = 400;

    try {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const { MicVAD } = await import("@ricky0123/vad-web");
        const vad = await MicVAD.new({
          model: "legacy",
          baseAssetPath: "/vad/",
          onnxWASMBasePath: "/vad/",
          // 기본값(0.5)보다 훨씬 높여서 TV 소리 등 마이크에서 멀리 떨어진/작은 소리에는
          // 덜 반응하고, 환자가 마이크 가까이서 또렷하게 말할 때만 발화로 인식하게 한다.
          // 실사용 피드백: 잡음이 너무 많이 인식되어 0.7/0.55 -> 0.8/0.65로 상향(더 엄격하게) 조정함.
          positiveSpeechThreshold: 0.8,
          negativeSpeechThreshold: 0.65,
          // 짧은 잡음(문 닫는 소리, 헛기침 등)이 발화로 잡히지 않게 최소 발화 길이를 둔다.
          // 실사용 피드백: "복실아"처럼 짧게 부르는 말이 700ms 미만이라 misfire로 통째로
          // 무시돼 앱 안에서 호출어를 불러도 아무 반응이 없었다 - 400ms로 완화.
          minSpeechMs: 400,
          // vad-web이 내부적으로 만드는 마이크 스트림을 그대로 붙잡아 MediaRecorder와
          // 공유한다 - 별도로 getUserMedia를 또 부르면 이 프로젝트에서 여러 번 겪었던
          // 마이크 충돌(NotReadableError)이 재발할 수 있다.
          getStream: async () => {
            const stream = await navigator.mediaDevices.getUserMedia({
              audio: { channelCount: 1, echoCancellation: true, autoGainControl: true, noiseSuppression: true },
            });
            streamRef.current = stream;
            return stream;
          },
          onSpeechStart: () => {
            setUserSpeaking(true);
            startPartialRecording();
          },
          onSpeechEnd: (audio) => {
            setUserSpeaking(false);
            stopPartialRecording();
            onSpeechSegmentRef.current?.(audio);
          },
          onVADMisfire: () => {
            setUserSpeaking(false);
            stopPartialRecording();
          },
        });
        vadRef.current = vad;
        vad.start();
        setListening(true);
        return;
      } catch (err) {
        const name = err instanceof Error ? err.name : "Unknown";
        const message = err instanceof Error ? err.message : String(err);
        const isBusy = name === "NotReadableError";
        const willRetry = isBusy && attempt < MAX_ATTEMPTS;

        if (!willRetry) {
          // getUserMedia 실패는 원인마다 대응이 다르다(NotAllowedError=권한, NotReadableError=다른 앱이
          // 마이크 점유). 기기에서만 보이면 원격에서 못 고치므로 이름까지 서버로 올린다.
          // ponytail: 진단용. 원인이 잡히면 이 report 호출만 지운다.
          void fetch("/api/client-log", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message: `마이크 실패: ${name} - ${message} (시도 ${attempt}/${MAX_ATTEMPTS})`,
            }),
          }).catch(() => undefined);
          setError(`${name}: ${message}`);
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
    } finally {
      startingRef.current = false;
    }
  }, []);

  const stop = useCallback(async () => {
    const vad = vadRef.current;
    vadRef.current = null;
    setListening(false);
    setUserSpeaking(false);
    stopPartialRecording();
    streamRef.current = null;
    if (vad) {
      await vad.destroy();
    }
  }, [stopPartialRecording]);

  return { listening, userSpeaking, error, start, stop };
}
