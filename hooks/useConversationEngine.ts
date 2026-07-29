"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useVAD, VAD_SAMPLE_RATE, type UseVADResult } from "@/hooks/useVAD";
import { useSpeechCalibration } from "@/hooks/useSpeechCalibration";
import { useAudioQueue } from "@/hooks/useAudioQueue";
import { useBargeIn } from "@/hooks/useBargeIn";
import { useConversationPersistence } from "@/hooks/useConversationPersistence";
import { isUtteranceComplete } from "@/lib/turnDetector";
import { encodeWav } from "@/lib/audio/encodeWav";
import { normalizeGain } from "@/lib/audio/normalizeGain";
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
 * 실사용 피드백: 평소 대화하듯 자연스러운 톤으로 말하면 -40 기준에 걸러져 인식이 안 됐다 -
 * 환자가 크게 또박또박 말하지 않는 게 일반적이므로 -50으로 완화. */
const MIN_SPEECH_DBFS = -50;

/** 다른 내용 없이 호출어("복실아")만 부른 발화를 판별한다 - 근처 발음 오차(예: "복실이")도 허용. */
const WAKE_WORD_ONLY_PATTERN = /^복실[아이][.!?~,]*$/;

/** LLM에 보내는 대화 기록(턴 수, user+assistant 합산)의 최대 길이. 웨이크워드로 하루 종일
 * 같은 웹뷰가 재사용되며 대화 기록이 무제한으로 쌓이면, 오래된(테스트 중 나온 이상한 STT
 * 결과 등도 포함된) 맥락이 쌓여 최근 대화와 무관한 엉뚱한 응답을 유도하는 문제가 있었다.
 * 보호자용 기록(DB)에는 영향 없음 - LLM에 보내는 컨텍스트만 최근 것으로 제한한다. */
const MAX_HISTORY_TURNS = 16;

function trimHistory(messages: ChatMessage[]): ChatMessage[] {
  return messages.length > MAX_HISTORY_TURNS ? messages.slice(-MAX_HISTORY_TURNS) : messages;
}

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
  // respondTo가 vad를 참조해야 하는데 vad(useVAD 호출)는 respondTo가 정의된 뒤에야
  // 만들 수 있다(handleSpeechSegment -> finalizeTurn -> respondTo 의존 순서 때문) -
  // ref로 우회해 순환 선언 문제를 피한다.
  const vadRef = useRef<UseVADResult | null>(null);
  const finalizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const waitingSinceRef = useRef<number | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  // TTS 합성은 도착하는 즉시 병렬로 시작하되(지연 최소화), 재생 큐에 들어가는 "순서"는
  // 이 체인으로 보장한다 - 나중에 요청한 문장이 먼저 응답으로 와도 순서가 꼬이지 않는다.
  const ttsChainRef = useRef<Promise<void>>(Promise.resolve());

  // barge-in 판정 시점에 최신 phase를 읽기 위한 ref (state는 클로저에서 stale할 수 있음).
  const phaseRef = useRef<ConversationPhase>("listening");
  // barge-in 처리용: assistantDraft(state)는 클로저에서 stale할 수 있어 최신값을 ref로도 들고 있는다.
  const assistantDraftRef = useRef("");
  // 이번 턴에서 실제로 끝까지 재생된(=환자가 진짜로 들은) 문장만 여기 쌓인다.
  const spokenTextRef = useRef("");
  // 직전 턴이 끼어들기로 중단됐을 때, 못다 한 말을 바로 다음 LLM 호출 한 번에만 힌트로 넘긴다.
  const interruptedNoteRef = useRef<string | null>(null);

  const clearFinalizeTimer = useCallback(() => {
    if (finalizeTimerRef.current) {
      clearTimeout(finalizeTimerRef.current);
      finalizeTimerRef.current = null;
    }
  }, []);

  const queueSentence = useCallback(
    (sentence: string, signal: AbortSignal) => {
      const synthesisPromise = ttsProvider.synthesize(sentence, signal).catch(() => null);
      // 이 문장이 실제로 끝까지 재생됐을 때만 불린다 - barge-in으로 잘리면 안 불려서,
      // spokenTextRef는 언제나 "환자가 진짜로 들은 부분"만 반영한다.
      const markSpoken = () => {
        spokenTextRef.current = spokenTextRef.current
          ? `${spokenTextRef.current} ${sentence}`
          : sentence;
      };
      ttsChainRef.current = ttsChainRef.current.then(async () => {
        if (signal.aborted) return;
        const blob = await synthesisPromise;
        if (signal.aborted) return;
        if (blob) {
          audioQueue.enqueue(blob, markSpoken);
        } else {
          // TTS(CLOVA Voice/edge-tts) 실패 시 브라우저 내장 SpeechSynthesis로 폴백 (이중 안전장치)
          speechQueue.enqueue(sentence, markSpoken);
        }
      });
    },
    [audioQueue],
  );

  const respondTo = useCallback(
    async (userText: string) => {
      setPhase("thinking");
      setErrorMsg(null);
      spokenTextRef.current = "";

      // 직전 턴의 오디오가 아직 큐에 남아있으면(레이스로 정리가 안 된 경우 등) 이번 턴의
      // 첫 문장과 겹쳐 재생될 수 있다 - 새 턴을 시작하기 전에 항상 깨끗이 비운다.
      audioQueue.stop();
      speechQueue.stop();

      // AI가 말하는 동안 마이크가 그 소리를 다시 주워듣고 엉뚱한 새 턴으로 이어지는
      // 경우가 있었다(에코) - 트랙만 잠깐 끄고(스트림 자체는 유지) AI가 말하는 동안은
      // 새 입력을 안 받는다. vad-web 기본 pause처럼 마이크를 통째로 stop()했다가 다시
      // getUserMedia()하는 방식이 아니라서, 매 턴 반복해도 안정적이다.
      void vadRef.current?.pause();

      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      // 직전 턴이 끼어들기로 끊겼다면, 못다 한 말을 이번 LLM 호출에만 상황 힌트로 붙인다.
      // 대화 기록(messagesRef/log)에는 안 남긴다 - 실제로 오간 말이 아니라 내부 힌트라서다.
      const interruptedRemainder = interruptedNoteRef.current;
      interruptedNoteRef.current = null;

      try {
        // 환자가 같은 말을 반복하는 건 흔한 일이라(페르소나 지침에도 명시), 매번 새로
        // 생성해야 그때그때 대화 맥락에 맞게 답한다 - 예전엔 같은 문장이면 캐시된 답을
        // 그대로 재생해서 대화가 앞으로 안 나가는 것처럼 느껴졌다.
        const history: ChatMessage[] = interruptedRemainder
          ? [
              ...messagesRef.current,
              {
                role: "system",
                content:
                  `방금 응답 중 "${interruptedRemainder}"라고 이어 말하려던 참이었는데 환자가 ` +
                  `끼어들어 다시 말을 걸었습니다. 하려던 말을 그대로 반복하지 말고, 필요하면 자연스럽게 ` +
                  `이어가거나 새 이야기에 맞춰 응답하세요.`,
              },
              { role: "user", content: userText },
            ]
          : [...messagesRef.current, { role: "user", content: userText }];

        const reply = await streamChat(history, {
          signal: controller.signal,
          onChunk: (fullSoFar) => {
            setPhase("speaking");
            assistantDraftRef.current = fullSoFar;
            setAssistantDraft(fullSoFar);
          },
          onSentence: (sentence) => queueSentence(sentence, controller.signal),
        });

        messagesRef.current = trimHistory([
          ...messagesRef.current,
          { role: "user", content: userText },
          { role: "assistant", content: reply },
        ]);
        setLog((prev) => [{ id: Date.now(), role: "assistant", text: reply }, ...prev]);
        persistence.saveTurn("assistant", reply);

        await audioQueue.whenIdle();
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          // 끼어들기 등으로 의도적으로 취소됨 - 별도 오류 표시 없음 (handleBargeIn이 처리함)
        } else {
          setErrorMsg(err instanceof Error ? err.message : "응답 생성에 실패했습니다.");
        }
      } finally {
        assistantDraftRef.current = "";
        setAssistantDraft("");
        // 이미 barge-in 등으로 다음 턴이 시작되어 phase가 바뀌었다면 덮어쓰지 않는다.
        setPhase((prev) => (prev === "thinking" || prev === "speaking" ? "listening" : prev));
        void vadRef.current?.resume();
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
      const trimmed = text.trim();
      if (!trimmed) {
        setPhase("listening");
        return;
      }

      // 앱이 이미 열려있는 상태에서 "복실아"만(다른 내용 없이) 부른 경우 - 이걸 그대로
      // LLM 대화 기록에 넣으면 AI가 그 단어를 사용자 이름처럼 오인해서 다음 응답부터
      // 사용자를 "복실아"라고 부르는 혼란이 실사용에서 확인됐다. LLM 호출 없이 짧게만
      // 반응하고, 대화 기록(messagesRef/서버 저장)에는 남기지 않는다.
      if (WAKE_WORD_ONLY_PATTERN.test(trimmed.replace(/\s+/g, ""))) {
        setLog((prev) => [{ id: Date.now(), role: "user", text: trimmed }, ...prev]);
        queueSentence("네, 말씀하세요.", new AbortController().signal);
        setPhase("listening");
        return;
      }

      setLog((prev) => [{ id: Date.now(), role: "user", text: trimmed }, ...prev]);
      persistence.saveTurn("user", trimmed);
      void respondTo(trimmed);
    },
    [clearFinalizeTimer, respondTo, persistence, queueSentence],
  );

  // vad-web이 같은 발화에 대해 onSpeechEnd를 수십ms 간격으로 두 번 쏘는 경우가 실사용에서
  // 확인됐다(원인 불명) - 그대로 두면 같은 말에 STT/응답이 통째로 두 번 일어나 음성이 겹쳐
  // 재생된다. 이전 구간 처리가 끝나기 전에 들어온 호출은 무시해 재진입을 막는다.
  const processingSegmentRef = useRef(false);

  const handleSpeechSegment = useCallback(
    async (audio: Float32Array) => {
      if (computeDbfs(audio) < MIN_SPEECH_DBFS) {
        // 너무 조용한/먼 소리 - 기존 턴 상태를 건드리지 않고 조용히 무시한다.
        return;
      }

      if (processingSegmentRef.current) return;
      processingSegmentRef.current = true;

      setPhase("transcribing");
      setErrorMsg(null);

      try {
        const wav = encodeWav(normalizeGain(audio), VAD_SAMPLE_RATE);
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

        // 하이브리드 엔드포인팅: 문장이 완결됐다고 보이면 아주 짧게만 대기하고(끊어서 다시
        // 말할 여지는 남겨두되 응답은 최대한 빨리 시작), 미완결로 보이면 기존처럼 더 기다린다.
        // 고정 무음 타임아웃 하나에만 기대지 않고, 매번 STT 결과의 문장 완결성으로 그 타임아웃
        // 자체를 짧게/길게 고른다.
        setPhase("waiting-more");
        waitingSinceRef.current = Date.now();
        const waitMs = isUtteranceComplete(text)
          ? calibration.completeSilenceMs
          : calibration.getIncompleteSilenceMs();
        finalizeTimerRef.current = setTimeout(() => finalizeTurn(turnTextRef.current), waitMs);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "전사에 실패했습니다.");
        setPhase("listening");
      } finally {
        processingSegmentRef.current = false;
      }
    },
    [calibration, finalizeTurn],
  );

  const vad = useVAD(handleSpeechSegment);
  useEffect(() => {
    vadRef.current = vad;
  }, [vad]);

  // 진짜 끼어들기: AI가 생각 중이거나 말하는 도중 사용자가 다시 말하면
  // 즉시 오디오/요청을 멈추고 그 발화를 새 턴의 시작으로 삼는다.
  const handleBargeIn = useCallback(() => {
    // 응답이 오가던 중이었다면, 실제로 들려준 부분은 대화 기록에 남기고 못다 한 나머지는
    // 다음 LLM 호출 힌트로 넘긴다 - 응답을 통째로 버리지 않고 끊긴 지점부터 이어가기 위함.
    if (phaseRef.current === "thinking" || phaseRef.current === "speaking") {
      const spoken = spokenTextRef.current.trim();
      const fullSoFar = assistantDraftRef.current.trim();
      const remainder = (fullSoFar.startsWith(spoken) ? fullSoFar.slice(spoken.length) : fullSoFar).trim();

      if (spoken) {
        messagesRef.current = [...messagesRef.current, { role: "assistant", content: spoken }];
        setLog((prev) => [{ id: Date.now(), role: "assistant", text: spoken }, ...prev]);
        persistence.saveTurn("assistant", spoken);
      }
      interruptedNoteRef.current = remainder || null;
    }

    abortControllerRef.current?.abort();
    audioQueue.stop();
    speechQueue.stop();
    turnTextRef.current = "";
    setInterimText("");
    assistantDraftRef.current = "";
    setAssistantDraft("");
    setPhase("listening");
  }, [audioQueue, persistence]);

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

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

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
