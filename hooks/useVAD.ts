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
      });
      vadRef.current = vad;
      vad.start();
      setListening(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "VAD 초기화에 실패했습니다.");
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
