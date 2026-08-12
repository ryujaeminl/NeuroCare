// claude-sonnet-5 Foundry 배포가 없어 항상 실패하던 문제로, 실제로 배포돼있는
// Azure OpenAI Responses API(app/api/realtime/web-search/route.ts와 동일 리소스/모델)로
// 교체했다. 이 판단은 단순 분류(일정 의도 있음/없음 + 날짜 추출)라 모델 품질 차이가
// 대화 품질에 미치는 영향이 적다.
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

/**
 * 환자의 발화에 "일정으로 등록해달라"는 의도가 있는지 별도의 짧은 LLM 호출로
 * 판단한다. 정규식 대신 LLM을 쓰는 이유: "다음 주 화요일" 같은 상대 날짜 표현을
 * 정규식으로 다루기 어렵다. 메인 대화 스트림(chat/route.ts)과 별개의 호출이라
 * 실패해도 대화 자체에는 영향이 없다 - null을 돌려주면 그냥 일정 제안 없이 넘어간다.
 */
export async function detectCalendarIntent(
  latestUserText: string,
): Promise<{ title: string; date: string } | null> {
  if (!AZURE_OPENAI_ENDPOINT || !AZURE_OPENAI_API_KEY || !latestUserText.trim()) return null;

  const today = new Date().toISOString().slice(0, 10);
  try {
    const response = await fetch(`${AZURE_OPENAI_ENDPOINT.replace(/\/$/, "")}/openai/v1/responses`, {
      method: "POST",
      headers: { "api-key": AZURE_OPENAI_API_KEY, "content-type": "application/json" },
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify({
        model: RESPONSES_MODEL,
        instructions:
          `오늘 날짜는 ${today}입니다. 아래 사용자 발화에 "일정으로 등록해달라"는 ` +
          `의도가 있으면(예: "다음 주 화요일에 병원 가야해", "모레 손녀 온다고 ` +
          `일정에 넣어줘") {"title": "짧은 제목", "date": "YYYY-MM-DD"} 형식의 JSON ` +
          `만 답하세요. 의도가 없으면(그냥 하는 말, 질문, 과거 이야기 등) 정확히 ` +
          `NONE 이라고만 답하세요. JSON이나 NONE 외의 다른 설명은 절대 붙이지 마세요.`,
        input: latestUserText,
        temperature: 0,
        max_output_tokens: 100,
      }),
    });
    if (!response.ok) return null;

    const data = (await response.json()) as ResponsesApiResult;
    const text = (data.output ?? [])
      .filter((item): item is ResponsesApiMessageItem => item.type === "message")
      .flatMap((item) => item.content ?? [])
      .filter((part): part is ResponsesApiOutputTextPart => part.type === "output_text")
      .map((part) => part.text)
      .join("")
      .trim();
    if (!text || text === "NONE") return null;

    const parsed = JSON.parse(text);
    if (
      typeof parsed.title === "string" &&
      parsed.title.trim() &&
      typeof parsed.date === "string" &&
      !Number.isNaN(Date.parse(parsed.date))
    ) {
      return { title: parsed.title.trim(), date: parsed.date };
    }
    return null;
  } catch {
    return null;
  }
}
