"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MicVAD } from "@ricky0123/vad-web";

/**
 * vad-web은 getUserMedia를 echoCancellation/autoGainControl/noiseSuppression을
 * 모두 켠 채로 내부에서 직접 호출하고, 그 제약조건을 옵션으로 바꿀 방법을 안 준다.
 * 그런데 일부 안드로이드 기기(삼성 WebView 등)는 그 조합으로 마이크를 잡을 때
 * NotReadableError를 내는 경우가 실제로 보고되어 있다 - 일반 Chrome 앱은 되고
 * WebView 안에서만 안 되는 것도 이 처리 차이 때문일 가능성이 크다.
 * getStream을 직접 넘겨 더 단순한 제약조건으로 요청하게 우회한다.
 */
async function getStreamWithPlainConstraints(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: false,
      autoGainControl: false,
      noiseSuppression: false,
    },
  });
}

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
  /** 모델을 다시 불러오지 않고 마이크 감시만 잠시 멈춘다 (AI 발화 중 자기 음성 픽업 방지용) */
  pause: () => Promise<void>;
  /** pause 이후 다시 감시를 재개한다 */
  resume: () => Promise<void>;
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
  const onSpeechSegmentRef = useRef(onSpeechSegment);
  useEffect(() => {
    onSpeechSegmentRef.current = onSpeechSegment;
  }, [onSpeechSegment]);

  const start = useCallback(async () => {
    if (vadRef.current) return;
    setError(null);

    // 안드로이드 앱에서는 화면 전환 직후 백그라운드 웨이크워드 서비스가 마이크를 놓아주는
    // 시점과 여기서 잡으려는 시점이 살짝 겹칠 수 있다 - 그 찰나엔 마이크가 아직 다른
    // 프로세스에 물려있어 NotReadableError가 난다. 이건 곧 풀리는 일시적 상태라 재시도한다.
    const MAX_ATTEMPTS = 4;
    const RETRY_DELAY_MS = 400;

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
          // 짧은 잡음(문 닫는 소리, 헛기침 등)이 발화로 잡히지 않게 최소 발화 길이를 늘린다.
          // 실사용 피드백: 잡음이 너무 많이 인식되어 500ms -> 700ms로 상향 조정함.
          minSpeechMs: 700,
          onSpeechStart: () => setUserSpeaking(true),
          onSpeechEnd: (audio) => {
            setUserSpeaking(false);
            onSpeechSegmentRef.current?.(audio);
          },
          onVADMisfire: () => setUserSpeaking(false),
          getStream: getStreamWithPlainConstraints,
          resumeStream: () => getStreamWithPlainConstraints(),
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

  const pause = useCallback(async () => {
    if (!vadRef.current) return;
    await vadRef.current.pause();
    setListening(false);
    setUserSpeaking(false);
  }, []);

  const resume = useCallback(async () => {
    if (!vadRef.current) return;
    vadRef.current.start();
    setListening(true);
  }, []);

  return { listening, userSpeaking, error, start, stop, pause, resume };
}
