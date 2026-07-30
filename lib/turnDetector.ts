/** 완결된 문장으로 끝났다고 볼 때 적용할 짧은 무음 임계값 (ms).
 * 지금은 STT/TTS를 GPU 서버에 직접 호출(Vercel 프록시 생략)해서 왕복이 줄었고
 * VAD 자체의 무음 판정(redemptionMs, useVAD.ts)도 짧아졌으니, 이 값이 전체 응답
 * 지연에서 차지하는 비중이 이전보다 커졌다 - "응답까지 2초 이내" 목표에 맞춰 하향. */
export const COMPLETE_SILENCE_MS = 300;

/** 미완결(머뭇거림)로 보일 때 적용할 기본 무음 임계값 (ms) - useSpeechCalibration이 개인화한다.
 * VAD 자체가 이미 무음을 redemptionMs만큼 기다린 뒤에야 이 단계로 넘어오므로, 여기서
 * 또 2초 가까이 기다리면 두 대기가 겹쳐 체감 지연이 커진다 - "2초 이내" 목표에 맞춰 하향. */
export const DEFAULT_INCOMPLETE_SILENCE_MS = 900;

/** 조사 - 문장이 아직 끝나지 않고 이어질 가능성이 높은 어미 */
const INCOMPLETE_SUFFIXES = [
  "은",
  "는",
  "이",
  "가",
  "을",
  "를",
  "의",
  "에",
  "에서",
  "에게",
  "께",
  "과",
  "와",
  "랑",
  "도",
  "만",
  "보다",
  "처럼",
  "같이",
  "으로",
  "로",
  "부터",
  "까지",
  "이나",
  "나",
  // 연결어미 - 문장이 끝나지 않고 다음 절로 이어질 때 (예: "학교에 가서", "밥을 먹고")
  "아서",
  "어서",
  "여서",
  "서",
  "니까",
  "으니까",
  "고",
  "며",
  "면서",
  "는데",
  "은데",
  "려고",
  "으려고",
  "도록",
  "다가",
];

/** 접속사/필러 - 뒤에 말이 더 이어질 것으로 예상되는 단어 (알츠하이머 환자의 단어 회상 중 멈춤에 흔함) */
const INCOMPLETE_WORDS = [
  "그리고",
  "그래서",
  "그러니까",
  "근데",
  "그런데",
  "하지만",
  "그러면",
  "그럼",
  "그러나",
  "왜냐하면",
  "아니면",
  "또는",
  "그",
  "저",
  "음",
  "어",
  "이제",
];

/** 종결어미 - 문장이 끝났다고 볼 수 있는 어미 */
const COMPLETE_SUFFIXES = ["습니다", "니다", "여요", "이요", "어요", "아요", "네요", "죠", "군요", "다", "요", "까", "지", "네", "군", "함", "임"];

/**
 * 전사된 텍스트가 의미상 완결된 문장인지 규칙 기반으로 판단한다.
 * 알츠하이머 환자는 단어 회상 중 조사/접속사에서 말을 멈추는 경우가 많아,
 * 그런 경우는 미완결로 보고 더 오래 기다린다.
 */
export function isUtteranceComplete(rawText: string): boolean {
  const text = rawText.trim();
  if (!text) return false;

  const lastChar = text.at(-1) ?? "";
  if (/[.!?]/.test(lastChar)) return true;

  const lastToken = text.split(/\s+/).at(-1) ?? "";
  if (!lastToken) return true;

  if (INCOMPLETE_WORDS.includes(lastToken)) return false;
  if (INCOMPLETE_SUFFIXES.some((suffix) => lastToken.endsWith(suffix))) return false;
  if (COMPLETE_SUFFIXES.some((suffix) => lastToken.endsWith(suffix))) return true;

  // 판단 근거가 뚜렷하지 않으면 완결로 보고 응답 지연을 최소화한다.
  return true;
}
