"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useVAD, VAD_SAMPLE_RATE } from "@/hooks/useVAD";
import { useSpeechCalibration } from "@/hooks/useSpeechCalibration";
import { useAudioQueue } from "@/hooks/useAudioQueue";
import { useBargeIn } from "@/hooks/useBargeIn";
import { useConversationPersistence } from "@/hooks/useConversationPersistence";
import { isUtteranceComplete } from "@/lib/turnDetector";
import { encodeWav } from "@/lib/audio/encodeWav";
import { streamChat, type ChatMessage } from "@/lib/llmStream";
import { ttsProvider } from "@/lib/tts/ttsClient";
import { speechQueue } from "@/lib/speechQueue";

export interface ConversationLogEntry {
  id: number;
  role: "user" | "assistant";
  text: string;
}

export type ConversationPhase = "listening" | "transcribing" | "waiting-more" | "thinking" | "speaking";

export interface UseConversationEngineResult {
  phase: ConversationPhase;
  interimText: string;
  assistantDraft: string;
  errorMsg: string | null;
  log: ConversationLogEntry[];
  vadListening: boolean;
  vadUserSpeaking: boolean;
  vadError: string | null;
}

function normalize(text: string) {
  return text.replace(/\s+/g, "").toLowerCase();
}

/** 발화 구간의 평균 음량(dBFS). VAD 확률만으로는 "말소리 같은 패턴"인지만 보고
 * 얼마나 크게/가까이서 들렸는지는 못 걸러내므로, 너무 작은(=먼 TV·다른 방 소리 등)
 * 구간은 whisper까지 보내지 않고 여기서 걸러낸다. */
function computeDbfs(samples: Float32Array): number {
  let sumSquares = 0;
  for (let i = 0; i < samples.length; i++) {
    sumSquares += samples[i] * samples[i];
  }
  const rms = Math.sqrt(sumSquares / samples.length);
  return rms > 0 ? 20 * Math.log10(rms) : -Infinity;
}

/** 이보다 작으면(=조용/먼 소리) whisper 호출 없이 무시한다. 너무 낮추면(더 음수로) 잡음에
 * 관대해지고, 너무 높이면 작게 말하는 환자의 목소리까지 걸러낼 수 있으니 실사용 보면서 조정.
 * 실사용 피드백: 잡음이 너무 많이 인식되어 -45 -> -40으로 상향(더 엄격하게) 조정함. */
const MIN_SPEECH_DBFS = -40;

/**
 * 버튼이나 웨이크워드 없이, 마이크가 항상 켜져 있는 화면에서 바로 대화를 주고받게 하는 엔진.
 * VAD로 발화 구간을 감지 -> whisper 전사 -> 문장 완결성 판단(자동 턴 종료) -> LLM 스트리밍
 * 응답 -> TTS 순차 재생까지 전부 처리하고, AI가 말하는 도중에도 마이크를 계속 감시해
 * 사용자가 다시 말하면 즉시 멈추고 새 턴으로 받아들인다(barge-in).
 */
export interface UseConversationEngineOptions {
  /** 로그인한 환자 계정일 때만 대화를 서버에 저장한다. */
  persist?: boolean;
}

export function useConversationEngine(
  options: UseConversationEngineOptions = {},
): UseConversationEngineResult {
  const persistence = useConversationPersistence(options.persist ?? false);
  const [phase, setPhase] = useState<ConversationPhase>("listening");
  const [interimText, setInterimText] = useState("");
  const [assistantDraft, setAssistantDraft] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [log, setLog] = useState<ConversationLogEntry[]>([]);

  const calibration = useSpeechCalibration();
  const audioQueue = useAudioQueue();

  // vad-web이 넘겨주는 각 발화 구간은 이미 앞뒤로 무음이 붙은 깨끗한 조각이므로,
  // 조각별로 각각 전사한 뒤 텍스트만 이어붙인다 (오디오를 이어붙이면 이음매에서
  // 부자연스러운 끊김이 생겨 whisper 인식이 흐트러진다).
  const turnTextRef = useRef("");
  const finalizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const waitingSinceRef = useRef<number | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const replyCacheRef = useRef<Map<string, string>>(new Map());
  const abortControllerRef = useRef<AbortController | null>(null);
  // TTS 합성은 도착하는 즉시 병렬로 시작하되(지연 최소화), 재생 큐에 들어가는 "순서"는
  // 이 체인으로 보장한다 - 나중에 요청한 문장이 먼저 응답으로 와도 순서가 꼬이지 않는다.
  const ttsChainRef = useRef<Promise<void>>(Promise.resolve());

  const clearFinalizeTimer = useCallback(() => {
    if (finalizeTimerRef.current) {
      clearTimeout(finalizeTimerRef.current);
      finalizeTimerRef.current = null;
    }
  }, []);

  const queueSentence = useCallback(
    (sentence: string, signal: AbortSignal) => {
      const synthesisPromise = ttsProvider.synthesize(sentence, signal).catch(() => null);
      ttsChainRef.current = ttsChainRef.current.then(async () => {
        if (signal.aborted) return;
        const blob = await synthesisPromise;
        if (signal.aborted) return;
        if (blob) {
          audioQueue.enqueue(blob);
        } else {
          // TTS(CLOVA Voice/edge-tts) 실패 시 브라우저 내장 SpeechSynthesis로 폴백 (이중 안전장치)
          speechQueue.enqueue(sentence);
        }
      });
    },
    [audioQueue],
  );

  const respondTo = useCallback(
    async (userText: string) => {
      setPhase("thinking");
      setErrorMsg(null);

      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const cacheKey = normalize(userText);
      const cached = replyCacheRef.current.get(cacheKey);

      try {
        let reply: string;
        if (cached) {
          reply = cached;
          setAssistantDraft(reply);
          setPhase("speaking");
          queueSentence(reply, controller.signal);
        } else {
          reply = await streamChat([...messagesRef.current, { role: "user", content: userText }], {
            signal: controller.signal,
            onChunk: (fullSoFar) => {
              setPhase("speaking");
              setAssistantDraft(fullSoFar);
            },
            onSentence: (sentence) => queueSentence(sentence, controller.signal),
          });
          replyCacheRef.current.set(cacheKey, reply);
        }

        messagesRef.current = [
          ...messagesRef.current,
          { role: "user", content: userText },
          { role: "assistant", content: reply },
        ];
        setLog((prev) => [{ id: Date.now(), role: "assistant", text: reply }, ...prev]);
        persistence.saveTurn("assistant", reply);

        await audioQueue.whenIdle();
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          // 끼어들기 등으로 의도적으로 취소됨 - 별도 오류 표시 없음
        } else {
          setErrorMsg(err instanceof Error ? err.message : "응답 생성에 실패했습니다.");
        }
      } finally {
        setAssistantDraft("");
        // 이미 barge-in 등으로 다음 턴이 시작되어 phase가 바뀌었다면 덮어쓰지 않는다.
        setPhase((prev) => (prev === "thinking" || prev === "speaking" ? "listening" : prev));
      }
    },
    [audioQueue, queueSentence, persistence],
  );

  const finalizeTurn = useCallback(
    (text: string) => {
      clearFinalizeTimer();
      waitingSinceRef.current = null;
      turnTextRef.current = "";
      setInterimText("");
      if (text.trim()) {
        setLog((prev) => [{ id: Date.now(), role: "user", text }, ...prev]);
        persistence.saveTurn("user", text);
        void respondTo(text);
      } else {
        setPhase("listening");
      }
    },
    [clearFinalizeTimer, respondTo, persistence],
  );

  const handleSpeechSegment = useCallback(
    async (audio: Float32Array) => {
      if (computeDbfs(audio) < MIN_SPEECH_DBFS) {
        // 너무 조용한/먼 소리 - 기존 턴 상태를 건드리지 않고 조용히 무시한다.
        return;
      }

      setPhase("transcribing");
      setErrorMsg(null);

      try {
        const wav = encodeWav(audio, VAD_SAMPLE_RATE);
        const form = new FormData();
        form.append("file", wav, "segment.wav");

        const response = await fetch("/api/stt", { method: "POST", body: form });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "전사에 실패했습니다.");

        const segmentText: string = (data.text ?? "").trim();
        if (segmentText) {
          turnTextRef.current = turnTextRef.current
            ? `${turnTextRef.current} ${segmentText}`
            : segmentText;
        }
        const text = turnTextRef.current;
        setInterimText(text);

        if (!text) {
          // 잡음 등으로 아무 텍스트도 나오지 않으면 턴을 유지한 채 계속 듣는다.
          setPhase("listening");
          return;
        }

        if (isUtteranceComplete(text)) {
          finalizeTurn(text);
        } else {
          setPhase("waiting-more");
          waitingSinceRef.current = Date.now();
          const waitMs = calibration.getIncompleteSilenceMs();
          finalizeTimerRef.current = setTimeout(() => finalizeTurn(turnTextRef.current), waitMs);
        }
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "전사에 실패했습니다.");
        setPhase("listening");
      }
    },
    [calibration, finalizeTurn],
  );

  const vad = useVAD(handleSpeechSegment);

  // 진짜 끼어들기: AI가 생각 중이거나 말하는 도중 사용자가 다시 말하면
  // 즉시 오디오/요청을 멈추고 그 발화를 새 턴의 시작으로 삼는다.
  const handleBargeIn = useCallback(() => {
    abortControllerRef.current?.abort();
    audioQueue.stop();
    speechQueue.stop();
    turnTextRef.current = "";
    setInterimText("");
    setAssistantDraft("");
    setPhase("listening");
  }, [audioQueue]);

  useBargeIn({
    userSpeaking: vad.userSpeaking,
    assistantBusy: phase === "thinking" || phase === "speaking",
    onBargeIn: handleBargeIn,
  });

  useEffect(() => {
    vad.start();
    return () => {
      abortControllerRef.current?.abort();
      audioQueue.stop();
      speechQueue.stop();
      vad.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 말을 다시 시작하면(=userSpeaking이 false->true로 전환) 대기 타이머를 취소하고,
  // 미완결 판정 후 실제로 얼마 만에 다시 말했는지 캘리브레이션에 반영한다.
  useEffect(() => {
    if (!vad.userSpeaking) return;
    if (waitingSinceRef.current !== null) {
      calibration.recordResumeGap(Date.now() - waitingSinceRef.current);
      waitingSinceRef.current = null;
    }
    clearFinalizeTimer();
  }, [vad.userSpeaking, calibration, clearFinalizeTimer]);

  useEffect(() => clearFinalizeTimer, [clearFinalizeTimer]);

  return {
    phase,
    interimText,
    assistantDraft,
    errorMsg,
    log,
    vadListening: vad.listening,
    vadUserSpeaking: vad.userSpeaking,
    vadError: vad.error,
  };
}
