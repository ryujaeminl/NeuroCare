import { NextRequest } from "next/server";
import { auth } from "@/lib/auth/authOptions";
import { buildFamilyRoster } from "@/lib/memory/familyContext";
import { searchMemories } from "@/lib/memory/pineconeClient";

const UPSTAGE_API_KEY = process.env.UPSTAGE_API_KEY;
const UPSTAGE_MODEL = process.env.UPSTAGE_MODEL || "solar-pro3";

const SYSTEM_PROMPT = `당신은 알츠하이머 환자와 대화하며 기억 회상을 돕는 따뜻한 이웃입니다.

【필수 규칙】
1. 반드시 존댓말만 사용하세요. 반말은 절대 금지입니다.
2. 1~2문장으로만 답하세요. 긴 문장이나 많은 정보는 금지입니다.
3. 첫 문장은 아주 짧게. "네" "그렇군요" "좋네요" 같이 한 마디로 시작하세요.
4. 자신을 이름으로 부르지 마세요. 절대 "저는 복실입니다" 같은 표현 금지.
5. 1인칭("저", "우리")으로만 말하세요. 절대 3인칭 금지.
6. 같은 질문을 여러 번 받아도 매번 처음처럼 성실하게 답하세요.
7. "아까도 말씀했는데" "이미 말씀하셨는데" 같은 지적은 절대 금지.
8. 환자의 말이 틀렸어도 절대 정정하지 마세요. 따뜻하게 받아주세요.
9. 개방형 질문으로 과거 기억을 자연스럽게 이끌어내세요.
10. 진단, 조언, 충고는 절대 금지. 오직 경청과 공감만 하세요.

【금지사항】
- "어떻게 도와드릴까요?" 같은 챗봇 말투 금지
- 수치, 통계, 의학정보 제시 금지
- 권유나 조언 금지
- 친절한 척하는 긴 인사말 금지

【올바른 예】
"그렇군요. 어떤 때였어요?"
"좋은 추억이네요."
"그럼 그 후엔 어떻게 되셨어요?"

【잘못된 예】
"아까도 말씀하셨는데요."
"저는 당신을 돕기 위해 여기 있습니다."
"어떻게 도와드릴까요?"
"정신 차리세요."
"틀렸습니다."`;


interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * 보호자 앱에서 입력한 가족 관계 + 과거 대화/기억 중 지금 발화와 비슷한 것을 찾아
 * 시스템 프롬프트에 덧붙인다. "지난번에 말씀하신 손주 이야기"처럼 자연스러운 회상을
 * 유도하기 위함이다. 둘 다 없으면(가족 미등록 + Pinecone 미설정) 프롬프트가 그대로 유지된다.
 */
async function buildSystemPrompt(patientId: string | null, latestUserText: string) {
  if (!patientId) return SYSTEM_PROMPT;

  const [roster, memories] = await Promise.all([
    buildFamilyRoster(patientId),
    latestUserText ? searchMemories(patientId, latestUserText, 3) : Promise.resolve([]),
  ]);

  let prompt = SYSTEM_PROMPT;

  if (roster) {
    prompt += `

[등록된 가족 관계]
아래는 보호자가 미리 등록해 둔, 확인된 가족 관계입니다. 대화 중 가족 이야기가 나오면 이 정보만 사용하세요.
아래 목록에 없는 가족 관계는 추측하거나 지어내지 마세요.
${roster}`;
  }

  if (memories.length > 0) {
    const recalled = memories
      .map((memory) => {
        const date = memory.createdAt ? memory.createdAt.slice(0, 10) : "이전";
        const label = memory.kind === "family_memory" ? "보호자가 알려준 기억" : memory.role === "assistant" ? "AI" : "환자";
        return `- (${date}) ${label}: ${memory.text}`;
      })
      .join("\n");

    prompt += `

[참고할 과거 대화/기억]
아래는 이 환자와 관련해 지금 이야기와 관련 있어 보이는 내용입니다(과거 대화 또는 보호자가 등록한 기억).
자연스러울 때만 부드럽게 언급하고, 억지로 끼워 넣지 마세요. 환자가 기억하지 못해도 다그치지 마세요.
${recalled}`;
  }

  return prompt;
}

export async function POST(request: NextRequest) {
  if (!UPSTAGE_API_KEY) {
    return new Response("UPSTAGE_API_KEY가 설정되지 않았습니다.", { status: 500 });
  }

  const { messages } = (await request.json()) as { messages: ChatMessage[] };

  // 로그인 상태면 그 환자의 과거 대화를 검색해 컨텍스트로 넣는다(비로그인도 대화는 가능).
  const session = await auth();
  const patientId = session?.user?.role === "patient" ? session.user.id : null;
  const latestUserText = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const systemPrompt = await buildSystemPrompt(patientId, latestUserText);

  const upstream = await fetch("https://api.upstage.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${UPSTAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: UPSTAGE_MODEL,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      stream: true,
      temperature: 0.7,
      max_tokens: 200,
      // solar-pro3는 reasoning 모델이라 이걸 명시하지 않으면 가끔 "생각 과정"이
      // 정제되지 않은 채 그대로 응답으로 나온 사례가 실사용에서 확인됐다(예:
      // "사용자 메시지는 '혹시라고 해'인데... 다음 문장은" 처럼 중간에 끊긴 서술체 출력).
      // 페르소나/프롬프트 문제가 아니라 reasoning 출력 자체였다 - 최소로 고정한다.
      reasoning_effort: "minimal",
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    return new Response(`Upstage 요청 실패 (${upstream.status}): ${detail}`, { status: 502 });
  }

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body!.getReader();
      let buffer = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const data = trimmed.slice(5).trim();
            if (data === "[DONE]") continue;
            try {
              const json = JSON.parse(data);
              const delta: string | undefined = json.choices?.[0]?.delta?.content;
              if (delta) controller.enqueue(encoder.encode(delta));
            } catch {
              // 조각난 채로 도착한 JSON은 건너뛴다 (다음 청크와 합쳐지길 기대)
            }
          }
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
