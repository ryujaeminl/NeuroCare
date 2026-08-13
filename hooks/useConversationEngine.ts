"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useVAD, VAD_SAMPLE_RATE } from "@/hooks/useVAD";
import { useStreamingStt } from "@/hooks/useStreamingStt";
import { useSpeechCalibration } from "@/hooks/useSpeechCalibration";
import { useAudioQueue } from "@/hooks/useAudioQueue";
import { useBargeIn } from "@/hooks/useBargeIn";
import { useConversationPersistence } from "@/hooks/useConversationPersistence";
import { isUtteranceComplete } from "@/lib/turnDetector";
import { encodeWav } from "@/lib/audio/encodeWav";
import { normalizeGain } from "@/lib/audio/normalizeGain";
import { streamChat, type ChatMessage, type ChatPhoto } from "@/lib/llmStream";
import { ttsProvider } from "@/lib/tts/ttsClient";
import { speechQueue } from "@/lib/speechQueue";
import type { MusicOverlayState } from "@/components/MusicOverlay";

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
  /** AI 음성의 실시간 음량(0~1). 캐릭터 입 모양 동기화에 사용한다. */
  speakingLevel: number;
  viseme: string;
  errorMsg: string | null;
  log: ConversationLogEntry[];
  vadListening: boolean;
  vadUserSpeaking: boolean;
  vadError: string | null;
  /** 이번 턴에 서버가 골라준 사진(동의 후 또는 회상 매칭). 다음 턴이 시작되면 자동으로 지워진다. */
  photo: ChatPhoto | null;
  dismissPhoto: () => void;
  musicOverlay: MusicOverlayState | null;
  dismissMusicOverlay: () => void;
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

/**
 * ponytail: 진단용. 앱 안에서 "복실아"를 불러도 무반응이라는 실사용 보고가 있어,
 * VAD/STT/호출어 판정 중 어디서 끊기는지 원격에서 확인하려고 남긴다.
 * 원인이 잡히면 이 함수와 호출부를 함께 지운다.
 */
function reportToServer(message: string) {
  void fetch("/api/client-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: `[대화엔진] ${message}` }),
  }).catch(() => undefined);
}

// GPU STT/TTS 서버를 브라우저에서 직접 호출하기 위한 주소. 네이티브 쉘의 WakeWordService는
// 이미 이 서버를 직접 호출한다("네이티브 HTTP 호출이라 CORS와 무관하다") - 웹만 지금까지
// Vercel(/api/stt, /api/tts)을 한 번 더 거쳤는데, 왕복이 그만큼 늘어난다. 직접 호출로
// 그 홉을 없애고, 실패할 때만(네트워크/CORS 등) 기존 Vercel 경유 경로로 폴백한다.
const DIRECT_BACKEND_URL = process.env.NEXT_PUBLIC_WHISPER_BACKEND_URL;

// /ws/transcribe(스트리밍 전사)용 URL. http(s) 주소를 ws(s)로 바꾸기만 하면 되고, 이 값
// 자체는 세션 동안 안 바뀌므로 모듈 스코프에서 한 번만 계산한다 - 화자 세션 id는 연결이
// 아니라 매번 보내는 "start" 메시지에 실어 보낸다(server/main.py 참고). 그래서 세션이
// 바뀌어도(앱 재개 시 sttSessionIdRef 재발급) 연결을 새로 열 필요가 없다.
const STREAMING_WS_URL = (() => {
  if (!DIRECT_BACKEND_URL) return null;
  try {
    const url = new URL("/ws/transcribe", DIRECT_BACKEND_URL);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return url.toString();
  } catch {
    return null;
  }
})();

async function transcribeSegment(form: FormData): Promise<{ text?: string; error?: string }> {
  if (DIRECT_BACKEND_URL) {
    try {
      const direct = await fetch(`${DIRECT_BACKEND_URL}/transcribe`, {
        method: "POST",
        headers: { "ngrok-skip-browser-warning": "true" },
        body: form,
      });
      if (direct.ok) return direct.json();
    } catch {
      // 직접 호출 실패 - 아래 Vercel 경유 폴백으로 이어간다.
    }
  }
  const response = await fetch("/api/stt", { method: "POST", body: form });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "전사에 실패했습니다.");
  return data;
}

/** 이보다 작으면(=조용/먼 소리) whisper 호출 없이 무시한다. 너무 낮추면(더 음수로) 잡음에
 * 관대해지고, 너무 높이면 작게 말하는 환자의 목소리까지 걸러낼 수 있으니 실사용 보면서 조정.
 * -40 -> -50을 거쳐, "평소 대화 톤보다 조금 작아도 다 인식되게 해달라"는 실사용 피드백에
 * 맞춰 -58로 더 완화했다. 이 방향(놓침 쪽)은 하드 프리필터라 스스로는 못 고치는 문제라
 * (걸러진 순간 증거가 안 남음) 이번처럼 명시적 신고가 있을 때만 안전하게 낮출 수 있다. */
const MIN_SPEECH_DBFS = -58;

/** 보호자가 따로 설정 안 하면 쓰는 기본 호출어. */
const DEFAULT_WAKE_WORD = "복실아";
/** 호출어 판정에 허용하는 자모 편집거리(발음 오차 허용치) - android WakeWordService.kt의
 * WAKE_WORD_MAX_JAMO_DIST와 맞춘 값. */
const WAKE_WORD_MAX_JAMO_DIST = 2;

/** 대화를 끝내고 싶다는 뜻만 담긴 짧은 발화를 판별한다. 앱을 통째로 닫는 동작으로
 * 이어지므로, 문장 일부에 이 단어가 섞인 경우(예: "어제 잘 잤어")까지 걸리지 않게
 * 발화 전체가 정확히 일치할 때만 매칭한다(오탐 방지가 속도보다 중요한 케이스). */
const END_CONVERSATION_PATTERN =
  /(복실아\s*)?(대화\s*종료|종료|앱\s*종료|이제\s*그만|그만\s*할래|그만\s*하자|끝낼래|끝내자|잘\s*자|잘\s*자요|잘\s*가|잘\s*가요|안녕히\s*주무세요|주무세요|안녕히\s*계세요)/i;

// 유니코드 한글 완성형 분해표(초성 19 / 중성 21 / 종성 28, 종성 0번=받침 없음).
const HANGUL_INITIALS = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
const HANGUL_MEDIALS = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ";
const HANGUL_FINALS = " ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ";

/** 완성형 한글 음절을 초성/중성/종성 자모로 풀어헤친다 - 글자는 달라도 소리가 비슷하면
 * 편집거리가 작게 나온다(android WakeWordService.kt의 decomposeHangul과 동일 알고리즘). */
function decomposeHangul(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0)! - 0xac00;
    if (code < 0 || code > 11171) {
      out += ch;
      continue;
    }
    const initial = Math.floor(code / (21 * 28));
    const medial = Math.floor(code / 28) % 21;
    const final = code % 28;
    out += HANGUL_INITIALS[initial] + HANGUL_MEDIALS[medial];
    if (final !== 0) out += HANGUL_FINALS[final];
  }
  return out;
}

function editDistance(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

/** 다른 내용 없이 호출어만 부른 발화인지 판별한다 - 정확한 문자열이 아니라 자모 편집거리로
 * 비교해서 "복실이"처럼 근처 발음도, 커스텀 호출어의 STT 오인식도 허용한다. */
function isWakeWordOnly(trimmed: string, wakeWordJamo: string): boolean {
  const stripped = trimmed.replace(/[\s.!?~,]+$/g, "");
  if (!stripped) return false;
  return editDistance(decomposeHangul(stripped), wakeWordJamo) <= WAKE_WORD_MAX_JAMO_DIST;
}

/**
 * "복실아, 내일 밥 뭐 먹지?"처럼 호출어 뒤에 진짜 용건이 붙은 발화에서 호출어 부분만
 * 뗀다. STT가 호출어를 살짝 다르게 알아듣는 경우가 흔해서 정확한 문자열 대신 자모
 * 편집거리로 판단한다. 앞 단어가 호출어와 충분히 비슷하고 뒤에 실제 내용이 남아있을
 * 때만 그 앞 단어를 제거한 나머지를 돌려준다 - 그래야 이 단어가 LLM 대화 기록에 남아
 * 사용자 이름처럼 오인되는 문제를 막으면서도 실제 질문은 그대로 응답할 수 있다.
 */
function stripWakeWordPrefix(text: string, wakeWordJamo: string): string {
  const match = text.match(/^(\S+?)[,.!?~\s]+([\s\S]+)$/);
  if (!match) return text;
  const [, firstWord, rest] = match;
  if (!rest.trim()) return text;
  const dist = editDistance(decomposeHangul(firstWord), wakeWordJamo);
  return dist <= WAKE_WORD_MAX_JAMO_DIST ? rest.trim() : text;
}

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
  const [photo, setPhoto] = useState<ChatPhoto | null>(null);

  const calibration = useSpeechCalibration();
  const audioQueue = useAudioQueue();
  const streaming = useStreamingStt(STREAMING_WS_URL);
  // 지금 진행 중인 발화가 스트리밍으로 서버에 전송되고 있었는지 - handleSpeechSegment가
  // endUtterance()를 시도할지, 곧바로 기존 업로드 경로로 갈지 여기로 판단한다.
  const utteranceStreamedRef = useRef(false);

  // vad-web이 넘겨주는 각 발화 구간은 이미 앞뒤로 무음이 붙은 깨끗한 조각이므로,
  // 조각별로 각각 전사한 뒤 텍스트만 이어붙인다 (오디오를 이어붙이면 이음매에서
  // 부자연스러운 끊김이 생겨 whisper 인식이 흐트러진다).
  const turnTextRef = useRef("");
  const finalizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const waitingSinceRef = useRef<number | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  // 날씨 질문에 실제로 답하기 위한 대략적 위치 - 세션당 한 번만 구해서 재사용한다(매
  // 턴마다 다시 물어볼 필요 없음). 권한이 없거나 실패해도 조용히 넘어간다 - 날씨 없이도
  // 대화 자체는 항상 되어야 한다.
  const locationRef = useRef<{ lat: number; lon: number } | undefined>(undefined);
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        locationRef.current = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      },
      () => {
        // 권한 거부/실패 - locationRef는 undefined로 남고, 날씨 질문엔 모른다고 답하게 된다.
      },
      { maximumAge: 30 * 60 * 1000, timeout: 5000 },
    );
  }, []);
  // 이 대화(앱을 열고 있는 동안)에서 처음 들린 목소리를 서버가 기준으로 삼아 이후
  // 발화를 거르는 데 쓴다(server/speaker.py의 check_session_speaker) - 사전 성문 등록
  // 없이도 TV/다른 가족 목소리를 자동으로 걸러내려는 목적. 마운트 시 한 번 만들고,
  // 그 뒤로는 handleAppForeground에서 포그라운드로 돌아올 때마다 새로 만든다(액티비티는
  // 백그라운드↔포그라운드 전환에 재마운트되지 않아 마운트 시점에만 새로 만들면 하루
  // 종일 같은 세션으로 남는다).
  const sttSessionIdRef = useRef(crypto.randomUUID());
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
  // 보호자가 설정한 커스텀 호출어(없으면 기본값) - 세션 중 자주 안 바뀌므로 ref로 들고
  // finalizeTurn 등의 콜백 의존성에 넣지 않는다.
  const wakeWordJamoRef = useRef(decomposeHangul(DEFAULT_WAKE_WORD));

  useEffect(() => {
    fetch("/api/patient/wake-word")
      .then((r) => r.json())
      .then((data: { wakeWord: string | null }) => {
        const word = data.wakeWord?.trim() || DEFAULT_WAKE_WORD;
        wakeWordJamoRef.current = decomposeHangul(word);
        // 네이티브 백그라운드 웨이크워드 감시(WakeWordService.kt)도 같은 단어를 듣게
        // 전달한다 - 웹 브라우저에서 열면 Android가 없어 그냥 no-op.
        (window as unknown as { Android?: { setWakeWord?: (word: string) => void } }).Android?.setWakeWord?.(word);
      })
      .catch(() => undefined);
  }, []);

  const clearFinalizeTimer = useCallback(() => {
    if (finalizeTimerRef.current) {
      clearTimeout(finalizeTimerRef.current);
      finalizeTimerRef.current = null;
    }
  }, []);

  const queueSentence = useCallback(
    (sentence: string, signal: AbortSignal) => {
      const synthesisPromise = ttsProvider
        .synthesize(sentence, signal)
        .then((blob) => {
          reportToServer(`TTS 합성 성공: "${sentence}" (${blob.size} bytes)`);
          return blob;
        })
        .catch((err) => {
          reportToServer(`TTS 합성 실패: "${sentence}" - ${err instanceof Error ? err.message : String(err)}`);
          return null;
        });
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

  // queueSentence는 합성 요청을 "발사하고 잊는" 방식이라(ttsChainRef에 체인만 걸어둠),
  // 마지막 문장의 합성+enqueue가 아직 안 끝난 시점에 audioQueue.whenIdle()만 보면 "아직
  // 아무것도 큐에 안 들어왔으니 idle"로 잘못 판단할 수 있다 - 실제로 이것 때문에 응답이
  // 길어서 마지막 문장 합성이 오래 걸릴 때, 턴이 다 끝난 걸로 착각하고 phase가
  // "listening"으로 풀려버려 barge-in 무장이 풀리고, 그 상태에서 무슨 소리(에코 등)든
  // 새 턴으로 오인되면 다음 respondTo()의 audioQueue.stop()이 아직 재생 중이던 마지막
  // 문장을 끊어버렸다("TTS가 길면 이야기가 끝나지도 않았는데 자동으로 종료" 실사용 보고).
  // ttsChainRef를 먼저 기다려 모든 문장이 실제로 큐에 들어간 뒤에야 idle 여부를 본다.
  const waitForSpeechToFinish = useCallback(async () => {
    await ttsChainRef.current;
    await Promise.all([audioQueue.whenIdle(), speechQueue.whenIdle()]);
  }, [audioQueue]);

  const respondTo = useCallback(
    async (userText: string) => {
      setPhase("thinking");
      setErrorMsg(null);
      setPhoto(null);
      spokenTextRef.current = "";

      // 직전 턴의 오디오가 아직 큐에 남아있으면(레이스로 정리가 안 된 경우 등) 이번 턴의
      // 첫 문장과 겹쳐 재생될 수 있다 - 새 턴을 시작하기 전에 항상 깨끗이 비운다.
      audioQueue.stop();
      speechQueue.stop();

      // ponytail 교훈: AI가 말하는 동안 마이크 트랙을 꺼서 에코를 막으려 했었는데,
      // 그러면 barge-in(끼어들기) 판정이 보는 vad.userSpeaking이 이 구간 내내 false로
      // 고정돼 사용자가 말을 걸어도 끼어들기 자체가 감지되지 않는 부작용이 있었다
      // (실사용 보고: "아니 그게 아니라"라고 정정해도 AI가 하던 말을 계속함).
      // 에코는 이미 브라우저 echoCancellation으로 처리되고, "복실아" 자기소개 혼선의
      // 진짜 원인은 대화 기록 오염 쪽이었다(별도로 수정) - 마이크는 항상 켜둔다.

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
          location: locationRef.current,
          onChunk: (fullSoFar) => {
            setPhase("speaking");
            assistantDraftRef.current = fullSoFar;
            setAssistantDraft(fullSoFar);
          },
          onSentence: (sentence) => queueSentence(sentence, controller.signal),
          onPhoto: (p) => setPhoto(p),
          onCalendarSync: () => {
            (window as unknown as { Android?: { syncCalendarNow?: () => void } }).Android?.syncCalendarNow?.();
          },
        });

        messagesRef.current = trimHistory([
          ...messagesRef.current,
          { role: "user", content: userText },
          { role: "assistant", content: reply },
        ]);
        setLog((prev) => [{ id: Date.now(), role: "assistant", text: reply }, ...prev]);
        persistence.saveTurn("assistant", reply);

        await waitForSpeechToFinish();
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
      }
    },
    [audioQueue, queueSentence, persistence, waitForSpeechToFinish],
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

      // 앱이 이미 열려있는 상태에서 호출어만(다른 내용 없이) 부른 경우 - 이걸 그대로
      // LLM 대화 기록에 넣으면 AI가 그 단어를 사용자 이름처럼 오인해서 다음 응답부터
      // 사용자를 호출어로 부르는 혼란이 실사용에서 확인됐다. LLM 호출 없이 짧게만
      // 반응하고, 대화 기록(messagesRef/서버 저장)에는 남기지 않는다.
      if (isWakeWordOnly(trimmed, wakeWordJamoRef.current)) {
        reportToServer(`호출어 단독 발화로 판정: "${trimmed}" - 짧게만 응답`);
        setLog((prev) => [{ id: Date.now(), role: "user", text: trimmed }, ...prev]);
        queueSentence("네, 말씀하세요.", new AbortController().signal);
        setPhase("listening");
        return;
      }

      // "대화 종료"/"잘자"처럼 대화를 끝내겠다는 뜻만 담긴 짧은 발화 - 인사를 들려준 뒤
      // 실제로 앱을 닫는다(네이티브 쉘의 Android.closeApp() 브릿지). 이전엔 마지막 응답
      // 후 20초 무음이면 무조건 앱을 닫는 타이머가 있었는데, 그 타이머가 정확히 이 문제를
      // 일으켰다("TTS가 길면 이야기가 끝나지도 않았는데 자동으로 종료") - 응답이 길어
      // 재생이 20초에 걸치면 아직 말하는 중에도 닫혀버렸다. 그 타이머를 없애고, 사용자가
      // 명시적으로 끝내고 싶다는 말을 했을 때만(+ 인사가 다 끝난 뒤에만) 닫도록 바꿨다.
      if (END_CONVERSATION_PATTERN.test(trimmed.replace(/\s+/g, ""))) {
        reportToServer(`대화 종료 발화로 판정: "${trimmed}" - 인사 후 앱 종료`);
        setLog((prev) => [{ id: Date.now(), role: "user", text: trimmed }, ...prev]);
        persistence.saveTurn("user", trimmed);
        const farewell = "네, 안녕히 계세요.";
        setLog((prev) => [{ id: Date.now(), role: "assistant", text: farewell }, ...prev]);
        persistence.saveTurn("assistant", farewell);
        setPhase("listening");
        queueSentence(farewell, new AbortController().signal);
        void waitForSpeechToFinish().then(() => {
          reportToServer("대화 종료 인사 재생 완료 - 앱 종료 신호 전송");
          (window as unknown as { Android?: { closeApp?: () => void } }).Android?.closeApp?.();
        });
        return;
      }

      // "복실아, 내일 밥 뭐 먹지?"처럼 호출어 뒤에 실제 용건이 붙은 경우 - 호출어 부분만
      // 떼고 나머지만 LLM에 보낸다(화면/기록에는 원문 그대로 남겨 보호자가 맥락을 알 수 있게 함).
      const forLlm = stripWakeWordPrefix(trimmed, wakeWordJamoRef.current);
      if (forLlm !== trimmed) {
        reportToServer(`호출어 접두어 제거: "${trimmed}" -> "${forLlm}"`);
      }

      reportToServer(`일반 발화로 판정: "${trimmed}" - LLM 호출`);
      setLog((prev) => [{ id: Date.now(), role: "user", text: trimmed }, ...prev]);
      persistence.saveTurn("user", trimmed);
      void respondTo(forLlm);
    },
    [clearFinalizeTimer, respondTo, persistence, queueSentence, waitForSpeechToFinish],
  );

  // vad-web이 같은 발화에 대해 onSpeechEnd를 수십ms 간격으로 두 번 쏘는 경우가 실사용에서
  // 확인됐다(원인 불명) - 그대로 두면 같은 말에 STT/응답이 통째로 두 번 일어나 음성이 겹쳐
  // 재생된다. 이전 구간 처리가 끝나기 전에 들어온 호출은 무시해 재진입을 막는다.
  const processingSegmentRef = useRef(false);

  const handleSpeechSegment = useCallback(
    async (audio: Float32Array) => {
      // 이 발화가 시작될 때 스트리밍이 진행됐었는지 여기서 딱 한 번만 읽고 리셋한다 -
      // 그 뒤로 처리 중 아무 시점에 다음 발화가 시작돼 이 값이 덮여써도 영향받지 않는다.
      const wasStreamed = utteranceStreamedRef.current;
      utteranceStreamedRef.current = false;

      const dbfs = computeDbfs(audio);
      reportToServer(`발화 구간 감지 dbfs=${dbfs.toFixed(1)} (기준 ${MIN_SPEECH_DBFS})`);
      if (dbfs < MIN_SPEECH_DBFS) {
        // 너무 조용한/먼 소리 - 기존 턴 상태를 건드리지 않고 조용히 무시한다. 스트리밍 중이었다면
        // 서버에 "end"를 보내지 않아 이번 구간 버퍼가 남지만, 다음 "start"가 자동으로 비운다.
        return;
      }

      if (processingSegmentRef.current) return;
      processingSegmentRef.current = true;

      setPhase("transcribing");
      setErrorMsg(null);

      try {
        // 스트리밍이 진행 중이었으면 이미 서버에 오디오 대부분이 가 있으니 "end"만 보내 끝낸다
        // - 실패/타임아웃이면 null이 와서 아래 업로드 경로로 폴백한다(안전망).
        const streamedText = wasStreamed ? await streaming.endUtterance() : null;

        let segmentText: string;
        if (streamedText !== null) {
          reportToServer(`전사 결과(스트리밍): "${streamedText}"`);
          segmentText = streamedText.trim();
        } else {
          const wav = encodeWav(normalizeGain(audio), VAD_SAMPLE_RATE);
          const form = new FormData();
          form.append("file", wav, "segment.wav");
          form.append("session_id", sttSessionIdRef.current);

          const data = await transcribeSegment(form);

          reportToServer(`전사 결과: "${data.text ?? ""}"`);
          segmentText = (data.text ?? "").trim();
        }

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
    [calibration, finalizeTurn, streaming],
  );

  // 발화가 시작되는 순간 스트리밍 연결이 준비돼 있으면 "start"를 보내고, 이번 발화는
  // 스트리밍으로 처리 중임을 표시한다. state가 아니라 ref라 onFrameProcessed(매 프레임)가
  // 같은 틱에 바로 이 값을 볼 수 있다.
  const handleVadSpeechStart = useCallback(() => {
    utteranceStreamedRef.current = streaming.ready;
    if (streaming.ready) streaming.startUtterance(sttSessionIdRef.current);
  }, [streaming]);

  const handleAudioFrame = useCallback(
    (frame: Float32Array) => {
      if (!utteranceStreamedRef.current) return;
      // 업로드 경로(handleSpeechSegment)와 동일하게 게인을 올려 보낸다 - 이 프레임 단위
      // 게인은 발화 전체를 보고 한 번에 계산하는 업로드 경로만큼 매끈하진 않지만(구간별로
      // 조금씩 다르게 증폭될 수 있음), 게인을 전혀 안 올리는 것보다는 훨씬 낫다. 평소
      // 톤으로 조용히 말하면 원음 그대로는 whisper가 못 알아듣는다는 게 이미 실측으로
      // 확인된 문제라(normalizeGain 주석 참고) 스트리밍 경로에도 반드시 필요하다.
      streaming.sendFrame(normalizeGain(frame));
    },
    [streaming],
  );

  const vad = useVAD({
    onSpeechSegment: handleSpeechSegment,
    onSpeechStart: handleVadSpeechStart,
    onAudioFrame: handleAudioFrame,
  });

  // 진행 중인 턴을 즉시 멈춘다. 실제로 들려준 부분은 대화 기록에 남기고 못다 한 나머지는
  // 다음 LLM 호출 힌트로 넘긴다 - 응답을 통째로 버리지 않고 끊긴 지점부터 이어가기 위함.
  // barge-in(끼어들기)과 앱 백그라운드 전환 둘 다 "지금 하던 턴을 깨끗이 접는다"는 점에서
  // 동일해 하나로 공유한다.
  const abortCurrentTurn = useCallback(() => {
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
    thinking: phase === "thinking",
    speaking: phase === "speaking",
    onBargeIn: abortCurrentTurn,
  });

  // 안드로이드 쉘이 백그라운드로 갈 때(onPause) 부르는 신호. 액티비티가 멈춰도
  // WebView의 JS(이 VAD/오디오 큐)는 안드로이드가 자동으로 멈춰주지 않는다 - 그대로
  // 두면 네이티브 웨이크워드 감시와 이 웹 대화엔진이 동시에 마이크를 잡고 각자 다른
  // 응답을 만들어 음성이 겹쳐 재생되는 문제가 실사용에서 확인됐다("목소리가 2중으로
  // 중첩되서 다른내용이랑 쓰여진내용두개가 동시에 출력"). 마이크를 완전히 놓아준다.
  const handleAppBackground = useCallback(() => {
    reportToServer("앱 백그라운드 전환 - 대화엔진 정지");
    abortCurrentTurn();
    vad.stop();
    clearFinalizeTimer();
    // vad.start/stop은 useVAD 내부에서 항상 같은 함수 참조로 고정돼 있어(빈 deps
    // useCallback), vad 객체 전체가 아니라 이 둘만 의존성으로 잡아 렌더마다 이 콜백이
    // 새로 만들어지는 것을 피한다(vad.userSpeaking 등은 렌더마다 자주 바뀐다).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abortCurrentTurn, vad.stop, clearFinalizeTimer]);

  const handleAppForeground = useCallback(() => {
    reportToServer("앱 포그라운드 복귀 - 대화엔진 재개 + 화자 세션 리셋");
    // 액티비티는 백그라운드↔포그라운드를 오가도 재마운트되지 않는다(onPause/onResume만
    // 호출되고 onCreate는 다시 안 불림) - sttSessionIdRef를 마운트 시 한 번만 만들면
    // 태블릿을 하루 종일 켜둘 때 이 화자 세션이 사실상 "오늘 하루 전체"로 늘어난다.
    // 그러면 앱을 연 지 한참 뒤(예: TV 소리)가 그날의 "기준 목소리"로 잘못 등록되고,
    // 그 뒤로는 실제 환자 목소리가 오히려 걸러지거나 TV 소리가 계속 통과하는 문제가
    // 생길 수 있다. "이 대화(앱이 켜져 있는 동안)에서 처음 들린 목소리"라는 원래 의도에
    // 맞게, 포그라운드로 돌아올 때마다(=새로 부른 대화가 시작될 때마다) 세션을 새로 만든다.
    sttSessionIdRef.current = crypto.randomUUID();
    void vad.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vad.start]);

  useEffect(() => {
    const win = window as unknown as Record<string, (() => void) | undefined>;
    win.__neurocarePause = handleAppBackground;
    win.__neurocareResume = handleAppForeground;
    return () => {
      win.__neurocarePause = undefined;
      win.__neurocareResume = undefined;
    };
  }, [handleAppBackground, handleAppForeground]);

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
    speakingLevel: 0,
    viseme: "viseme_sil",
    errorMsg,
    log,
    vadListening: vad.listening,
    vadUserSpeaking: vad.userSpeaking,
    vadError: vad.error,
    photo,
    dismissPhoto: () => setPhoto(null),
    musicOverlay: null,
    dismissMusicOverlay: () => {},
  };
}
