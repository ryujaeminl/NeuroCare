import { isMood, MOOD_VALUES, type Mood } from "@/lib/db/types";

// claude-sonnet-5 Foundry 배포가 없어 기분 분석이 항상 404로 실패하던 문제로,
// 실제로 배포돼있는 Azure OpenAI Responses API(app/api/realtime/web-search/route.ts와
// 동일 리소스/모델)로 교체했다.
const AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;
const AZURE_OPENAI_API_KEY = process.env.AZURE_OPENAI_API_KEY;
const RESPONSES_MODEL = process.env.AZURE_OPENAI_RESPONSES_MODEL ?? "gpt-5.4-mini";

/** Azure OpenAI Responses API 원본 JSON 응답 중 텍스트 추출에 필요한 필드만 타입화한다. */
interface ResponsesApiOutputTextPart {
  type: "output_text";
  text: string;
}
interface ResponsesApiMessageItem {
  type: "message";
  content?: Array<ResponsesApiOutputTextPart | { type: string }>;
}
interface ResponsesApiResult {
  output?: Array<ResponsesApiMessageItem | { type: string }>;
}

export interface MoodResult {
  mood: Mood;
  confidence: number;
  summary: string;
  notableMoments: string[];
}

export interface AnalyzableTurn {
  role: string;
  text: string;
}

/**
 * 임상 진단이 아니라 "그날 대화에서 드러난 정서적 톤"만 뽑아내는 것이 목적이다.
 * 근거 구절을 반드시 남기게 해서 보호자가 맥락을 직접 확인할 수 있게 한다.
 */
// 예시는 반드시 "그 자체로 유효한 JSON"이어야 한다.
// 값 자리에 설명이나 `|` 같은 표기를 넣으면 모델이 깨진 JSON을 흉내 내서 파싱이 실패한다.
const SYSTEM_PROMPT = `당신은 알츠하이머 환자의 대화 기록을 읽고 그날의 정서적 톤을 정리하는 보조 도구입니다.

중요: 이것은 의학적 진단이 아닙니다. 대화에서 드러난 정서적 인상만 참고용으로 정리하세요.
질병을 단정하거나 치료를 권하지 마세요.

출력은 아래와 똑같은 구조의 JSON 객체 하나여야 합니다. 다른 설명은 붙이지 마세요.

{
  "mood": "positive",
  "confidence": 0.9,
  "summary": "손주 이야기를 하며 밝은 모습을 보이셨습니다.",
  "notable_moments": ["어제 손주가 놀러왔어요", "같이 된장찌개를 먹었어요"]
}

규칙:
- mood는 다음 다섯 개 중 하나만 사용하세요: ${MOOD_VALUES.join(", ")}
- confidence는 0과 1 사이의 숫자입니다.
- summary는 보호자가 읽을 2~3문장이며, 반드시 "(환자 이름)님은 오늘"로 시작하세요.
  예: "철수님은 오늘 손주 이야기를 하며 밝은 모습을 보이셨습니다."
- notable_moments는 대화에 실제로 나온 짧은 구절들의 배열입니다.
  각 구절 안에 따옴표를 넣지 마세요. 근거가 없으면 빈 배열로 두세요.
- 환자를 존중하는 표현을 쓰세요.`;

/**
 * 모델이 코드블록으로 감싸거나 JSON에 없는 이스케이프(\', \x 등)를 섞어 보내는 경우가 있다.
 * response_format으로 대부분 막히지만, 그래도 실패하면 잘못된 이스케이프만 걷어내고 다시 시도한다.
 */
function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : raw).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("JSON 응답을 찾을 수 없습니다.");
  }

  const slice = candidate.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch {
    // JSON이 허용하는 이스케이프는 " \ / b f n r t u뿐이다. 나머지 백슬래시는 제거한다.
    const repaired = slice.replace(/\\(?!["\\/bfnrtu])/g, "");
    return JSON.parse(repaired);
  }
}

function toMoodResult(parsed: unknown): MoodResult {
  const record = parsed as Record<string, unknown>;
  const mood = typeof record.mood === "string" && isMood(record.mood) ? record.mood : "neutral";
  const rawConfidence = Number(record.confidence);

  return {
    mood,
    confidence: Number.isFinite(rawConfidence) ? Math.min(1, Math.max(0, rawConfidence)) : 0.5,
    summary: typeof record.summary === "string" ? record.summary : "요약을 생성하지 못했습니다.",
    notableMoments: Array.isArray(record.notable_moments)
      ? record.notable_moments.filter((v): v is string => typeof v === "string")
      : [],
  };
}

export async function analyzeMood(turns: AnalyzableTurn[], patientName: string): Promise<MoodResult> {
  if (!AZURE_OPENAI_ENDPOINT || !AZURE_OPENAI_API_KEY) {
    throw new Error("AZURE_OPENAI_ENDPOINT / AZURE_OPENAI_API_KEY가 설정되지 않았습니다.");
  }

  const transcript = turns
    .map((turn) => `${turn.role === "assistant" ? "AI" : "환자"}: ${turn.text}`)
    .join("\n");

  const response = await fetch(`${AZURE_OPENAI_ENDPOINT.replace(/\/$/, "")}/openai/v1/responses`, {
    method: "POST",
    headers: { "api-key": AZURE_OPENAI_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({
      model: RESPONSES_MODEL,
      instructions: SYSTEM_PROMPT,
      // Azure OpenAI가 text.format:"json_object"를 쓰려면 instructions가 아니라
      // input 자체에 "json"이라는 단어가 있어야 한다("Response input messages must
      // contain the word 'json'") - instructions에만 있으면 400으로 거부된다.
      input: `환자 이름: ${patientName}\n\n아래는 오늘의 대화 기록입니다. 위 지시대로 JSON으로 답하세요.\n\n${transcript}`,
      // 프롬프트 지시만으로는 코드펜스/여분 텍스트가 섞여 올 때가 있어 JSON 모드로 강제한다 -
      // 그래도 실패하면 아래 extractJson의 코드펜스/이스케이프 복구 폴백이 받는다.
      text: { format: { type: "json_object" } },
      temperature: 0.2,
      max_output_tokens: 600,
    }),
  }).catch((error: unknown) => {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`기분 분석 실패: ${detail}`);
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`기분 분석 실패: ${response.status} ${raw}`);
  }

  const data = JSON.parse(raw) as ResponsesApiResult;
  const content = (data.output ?? [])
    .filter((item): item is ResponsesApiMessageItem => item.type === "message")
    .flatMap((item) => item.content ?? [])
    .filter((part): part is ResponsesApiOutputTextPart => part.type === "output_text")
    .map((part) => part.text)
    .join("");

  return toMoodResult(extractJson(content));
}
