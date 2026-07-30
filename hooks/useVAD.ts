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

/**
 * Silero VAD(@ricky0123/vad-web)를 감싸는 훅.
 * onSpeechSegment은 발화 구간이 끝날 때마다 그 구간의 오디오(16kHz mono Float32Array)를 넘겨준다
 * - 대기 화면의 웨이크워드 감지, 2단계 턴 종료 판단 등에서 재사용한다.
 */
export function useVAD(onSpeechSegment?: (audio: Float32Array) => void): UseVADResult {
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
          // 실사용 피드백: "야", "복실아"처럼 아주 짧게 부르는 말은 400ms도 넘겨서
          // misfire로 무시되는 경우가 있었다 - 250ms로 더 완화.
          minSpeechMs: 250,
          // vad-web 기본값은 1400ms - "말이 끝난 것 같다"고 판단한 뒤에도 이만큼 무음이
          // 더 지속돼야 onSpeechEnd가 불린다. 지금까지 이 값을 따로 안 정해서 매 턴마다
          // STT가 시작되기도 전에 1.4초가 그냥 죽는 시간이었다("응답까지 2초 이내" 요청 시
          // 로그로 확인). 문장이 진짜 끝났는지 더 세밀하게 보는 로직(turnDetector의
          // isUtteranceComplete + 미완결이면 더 기다리는 하이브리드 대기)이 이 뒤에 이미
          // 있고, 구간을 여러 개로 짧게 나눠 잡아도 텍스트가 이어붙는 구조(turnTextRef)라
          // 여기서 짧게 끊겨도 안전하다 - 줄인다.
          redemptionMs: 600,
          onSpeechStart: () => setUserSpeaking(true),
          onSpeechEnd: (audio) => {
            setUserSpeaking(false);
            onSpeechSegmentRef.current?.(audio);
          },
          onVADMisfire: () => {
            setUserSpeaking(false);
            // ponytail: 진단용. "복실아"/"야" 같은 아주 짧은 호출이 misfire로 무시되는지
            // 확인하려고 남긴다. 원인이 잡히면 지운다.
            void fetch("/api/client-log", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ message: "[대화엔진] VAD misfire (너무 짧은 발화로 무시됨)" }),
            }).catch(() => undefined);
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
    if (vad) {
      await vad.destroy();
    }
  }, []);

  return { listening, userSpeaking, error, start, stop };
}
