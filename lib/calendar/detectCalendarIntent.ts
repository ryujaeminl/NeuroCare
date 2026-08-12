import AnthropicFoundry from "@anthropic-ai/foundry-sdk";

// Azure AI Foundry 구독 키 사용 - ANTHROPIC_FOUNDRY_API_KEY / ANTHROPIC_FOUNDRY_RESOURCE
// 환경변수를 SDK가 자동으로 읽는다 (app/api/chat/route.ts와 동일한 클라이언트 설정).
const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
const foundryClient = new AnthropicFoundry();

/**
 * 환자의 발화에 "일정으로 등록해달라"는 의도가 있는지 별도의 짧은 LLM 호출로
 * 판단한다. 정규식 대신 LLM을 쓰는 이유: "다음 주 화요일" 같은 상대 날짜 표현을
 * 정규식으로 다루기 어렵다. 메인 대화 스트림(chat/route.ts)과 별개의 호출이라
 * 실패해도 대화 자체에는 영향이 없다 - null을 돌려주면 그냥 일정 제안 없이 넘어간다.
 */
export async function detectCalendarIntent(
  latestUserText: string,
): Promise<{ title: string; date: string } | null> {
  if (!process.env.ANTHROPIC_FOUNDRY_API_KEY || !latestUserText.trim()) return null;

  const today = new Date().toISOString().slice(0, 10);
  try {
    const response = await foundryClient.messages.create(
      {
        model: CLAUDE_MODEL,
        system:
          `오늘 날짜는 ${today}입니다. 아래 사용자 발화에 "일정으로 등록해달라"는 ` +
          `의도가 있으면(예: "다음 주 화요일에 병원 가야해", "모레 손녀 온다고 ` +
          `일정에 넣어줘") {"title": "짧은 제목", "date": "YYYY-MM-DD"} 형식의 JSON ` +
          `만 답하세요. 의도가 없으면(그냥 하는 말, 질문, 과거 이야기 등) 정확히 ` +
          `NONE 이라고만 답하세요. JSON이나 NONE 외의 다른 설명은 절대 붙이지 마세요.`,
        messages: [{ role: "user", content: latestUserText }],
        temperature: 0,
        max_tokens: 100,
      },
      { timeout: 5000 },
    );

    const block = response.content.find((b) => b.type === "text");
    const text = (block?.type === "text" ? block.text : "").trim();
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
