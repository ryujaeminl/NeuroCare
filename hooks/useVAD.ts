"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MicVAD } from "@ricky0123/vad-web";

/** vad-web이 onSpeechEnd로 넘겨주는 오디오의 고정 샘플레이트 */
export const VAD_SAMPLE_RATE = 16000;

// 발화가 "시작"되는 순간(사용자가 아직 말하는 중) GPU 백엔드로 가벼운 ping을 미리
// 보내 TCP/TLS 연결을 데워둔다. 이러면 핸드셰이크 비용이 사용자가 말을 마치기 전에
// 백그라운드에서 끝나 있어, 실제 STT/TTS 요청 때는 이미 열려있는 연결을 재사용한다
// - "최대한 짧게" 요청에 따른 것으로, 매 발화마다 한 번뿐이라 서버 부하는 무시할 만하다.
const DIRECT_BACKEND_URL = process.env.NEXT_PUBLIC_WHISPER_BACKEND_URL;
function preconnectBackend() {
  if (!DIRECT_BACKEND_URL) return;
  void fetch(`${DIRECT_BACKEND_URL}/health`, {
    headers: { "ngrok-skip-browser-warning": "true" },
    keepalive: true,
  }).catch(() => undefined);
}

export interface UseVADResult {
  /** VAD가 마이크를 듣고 있는지 여부 */
  listening: boolean;
  /** 현재 프레임에서 발화가 감지되었는지 여부 (시각적 인디케이터용) */
  userSpeaking: boolean;
  error: string | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

export interface UseVADCallbacks {
  /** 발화 구간이 끝날 때마다 그 구간의 오디오(16kHz mono Float32Array)를 넘겨준다
   * - 대기 화면의 웨이크워드 감지, 2단계 턴 종료 판단 등에서 재사용한다. */
  onSpeechSegment?: (audio: Float32Array) => void;
  /** 발화가 시작되는 순간(끝나길 기다리지 않고) 동기적으로 알려준다 - 서버 스트리밍
   * 전사(/ws/transcribe)에 "start" 신호를 보내는 시점을 잡는 데 쓴다. state(userSpeaking)를
   * 보고 useEffect로 유추하면 같은 콜백 틱 안에서 반영이 늦어 경쟁 상태가 생길 수 있어
   * 별도 콜백으로 둔다. */
  onSpeechStart?: () => void;
  /** 발화 구간이 끝나길 기다리지 않고, VAD가 처리하는 매 프레임(16kHz mono)을 실시간으로
   * 넘겨준다 - 서버 스트리밍 전사에 발화 도중 청크를 바로 올려 보내는 데 쓴다.
   * 필요 없으면 생략해도 기존 동작(구간 단위 일괄 전사)은 그대로다. */
  onAudioFrame?: (frame: Float32Array) => void;
}

/**
 * Silero VAD(@ricky0123/vad-web)를 감싸는 훅.
 */
export function useVAD(callbacks: UseVADCallbacks = {}): UseVADResult {
  const [listening, setListening] = useState(false);
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const vadRef = useRef<MicVAD | null>(null);
  // MicVAD.new()는 비동기라, 그게 끝나기 전에 start()가 한 번 더 불리면 vadRef.current가
  // 아직 null이라 아래 가드를 통과해버려 VAD 인스턴스가 두 개 생길 수 있다 - 그럼 같은
  // 발화를 두 인스턴스가 각각 감지해 STT/응답이 통째로 두 번 돈다(실사용에서 확인된 버그).
  // 비동기 구간 전체를 이 플래그로 막아 재진입을 원천 차단한다.
  const startingRef = useRef(false);
  const callbacksRef = useRef(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  });
  // onSpeechStart~onSpeechEnd/onVADMisfire 구간 안에서만 onAudioFrame을 흘려보낸다 - 이
  // 범위 밖(무음 구간)의 프레임까지 스트리밍 전사 쪽으로 보내면 낭비이기도 하고, 다음
  // 발화가 시작되기도 전에 서버 버퍼가 채워지기 시작하는 꼴이 된다. state(userSpeaking)가
  // 아니라 ref로 즉시(동기적으로) 갱신해 같은 콜백 틱 안에서도 정확히 반영되게 한다.
  const speakingActiveRef = useRef(false);
  // vad-web 자신의 preSpeechPadMs 기본값(800ms)과 legacy 모델의 frameSamples(1536,
  // 16kHz에서 96ms/프레임)로 계산한 프레임 수 - onSpeechEnd가 넘겨주는 최종 오디오에는
  // "말하기 감지 직전" 이 구간이 항상 포함돼 있다(vad-web이 내부적으로 유지). 스트리밍
  // 경로가 onSpeechStart 이후 프레임만 보내면 이 구간이 통째로 빠져 문장 맨 앞이 잘려나간다
  // (실사용에서 확인) - 말하는 중이 아닐 때도 최근 프레임을 이만큼 계속 들고 있다가, 발화가
  // 시작되는 순간 한꺼번에 흘려보내 vad-web의 동작과 맞춘다.
  const PRE_SPEECH_PAD_FRAMES = 8;
  const preRollRef = useRef<Float32Array[]>([]);

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
          // 더 지속돼야 onSpeechEnd가 불린다. 1400 -> 600 -> 400을 거쳐 "음성 대기시간을
          // 더 줄여달라"는 요청에 맞춰 300으로 더 내렸다. 이렇게 짧게 내려도 안전한 이유:
          // (1) 문장이 진짜 끝났는지 더 세밀하게 보는 로직(turnDetector의 isUtteranceComplete
          // + 미완결이면 더 기다리는 하이브리드 대기)이 이 뒤에 있고, (2) 사용자가 말을
          // 이어가면(userSpeaking이 다시 true가 되는 순간) 대기 타이머를 즉시 취소하고
          // 이어지는 발화를 텍스트에 그대로 이어붙이는 안전망(useConversationEngine.ts의
          // "말을 다시 시작하면 대기 타이머를 취소" effect)이 이미 있다 - redemptionMs가
          // 짧아 숨 고르는 틈에 onSpeechEnd가 일찍 불려도, 이 안전망이 그 조기 종료를
          // 무효화하고 이어지는 말을 그대로 받아 합친다. 그래도 말 중간에 자꾸 끊긴다면
          // 이 값을 다시 올릴 것.
          redemptionMs: 300,
          onSpeechStart: () => {
            setUserSpeaking(true);
            speakingActiveRef.current = true;
            preconnectBackend();
            callbacksRef.current.onSpeechStart?.();
            // "start" 신호(위 콜백에서 보냄)가 먼저 나간 뒤에 쌓아뒀던 사전 발화 프레임을
            // 순서대로 흘려보낸다 - 순서를 바꾸면 서버가 다음 발화의 버퍼를 리셋하기 전에
            // 이 프레임들이 도착해 이전 발화 버퍼에 섞여 들어갈 수 있다.
            for (const frame of preRollRef.current) {
              callbacksRef.current.onAudioFrame?.(frame);
            }
            preRollRef.current = [];
          },
          onSpeechEnd: (audio) => {
            setUserSpeaking(false);
            speakingActiveRef.current = false;
            callbacksRef.current.onSpeechSegment?.(audio);
          },
          onFrameProcessed: (_probabilities, frame) => {
            if (!speakingActiveRef.current) {
              preRollRef.current.push(frame);
              if (preRollRef.current.length > PRE_SPEECH_PAD_FRAMES) preRollRef.current.shift();
              return;
            }
            callbacksRef.current.onAudioFrame?.(frame);
          },
          onVADMisfire: () => {
            setUserSpeaking(false);
            speakingActiveRef.current = false;
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
