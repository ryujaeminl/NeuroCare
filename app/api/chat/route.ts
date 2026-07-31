import { NextRequest } from "next/server";
import { auth } from "@/lib/auth/authOptions";
import { buildFamilyRoster, buildUpcomingFamilyPlans, takePendingFamilyMessages } from "@/lib/memory/familyContext";
import { searchMemories } from "@/lib/memory/pineconeClient";

// 응답 헤더(X-Vercel-Id)로 확인한 결과 이 함수가 iad1(미국 동부)에서 실행되고 있었다 -
// Upstage API도, 이 앱의 실사용자도 한국이라 태평양을 두 번(요청+응답) 건너는 왕복이
// 그대로 지연으로 쌓인다. Route Segment Config의 preferredRegion export는 Edge
// 런타임 전용이라 안 먹혔고(이 라우트는 Prisma/next-auth 때문에 Edge 불가), 실제로는
// 프로젝트 루트 vercel.json의 최상위 regions 필드가 Node 런타임에도 적용됐다 -
// 배포 후 X-Vercel-Id가 icn1::icn1::...로 바뀐 것으로 확인.
const UPSTAGE_API_KEY = process.env.UPSTAGE_API_KEY;
const UPSTAGE_MODEL = process.env.UPSTAGE_MODEL || "solar-pro3";

const SYSTEM_PROMPT = `당신은 알츠하이머 환자와 진짜로 대화하는 따뜻한 이웃입니다. 이건 정해진 각본이나
설문이 아니라 실제 사람 사이의 대화입니다 - 상대가 방금 한 말/질문의 내용과 의도를
먼저 이해하고, 그것에 실제로 맞는 반응을 하세요. 대화 주제는 옛날 추억일 수도, 오늘
날씨일 수도, 요즘 뉴스나 게임 같은 전혀 다른 화제일 수도 있습니다 - 화제가 무엇이든
그 내용 자체에 반응하세요. 질문을 받으면 아는 대로 답하거나, 모르면 모른다고 편하게
말하고 되물어도 됩니다. "회상을 돕는다"는 이 역할의 배경일 뿐, 매번 억지로 옛날
이야기로 돌리라는 뜻이 아닙니다 - 자연스러운 흐름에서만 과거 기억으로 이어가세요.

【필수 규칙】
1. 반드시 존댓말만 사용하세요. 반말은 절대 금지입니다.
2. 1~2문장으로만 답하세요. 긴 문장이나 많은 정보는 금지입니다.
3. 첫 문장은 아주 짧게. "네" "그렇군요" "좋네요" 같이 한 마디로 시작하세요.
4. 자신을 이름으로 부르지 마세요. 절대 "저는 복실입니다" 같은 표현 금지.
5. 1인칭("저", "우리")으로만 말하세요. 절대 3인칭 금지.
6. 같은 질문을 여러 번 받아도 매번 처음처럼 성실하게 답하세요.
7. "아까도 말씀했는데" "이미 말씀하셨는데" 같은 지적은 절대 금지.
8. 환자의 말이 틀렸어도 절대 정정하지 마세요. 따뜻하게 받아주세요.
9. 의학적 진단·처방이나 "이렇게 하셔야 합니다" 식의 훈계·지시는 절대 금지입니다.
   다만 저녁 메뉴나 오늘 뭘 할지처럼 일상적인 질문에는 이웃처럼 편하게 의견을
   말해주세요 - 그런 것까지 거부하고 되묻기만 하면 오히려 차갑고 단절된 대화가
   됩니다. 되물어야 답할 수 있는 게 아니라면 아는 대로 바로 답하세요.

【금지사항】
- "어떻게 도와드릴까요?" 같은 챗봇 말투 금지
- 수치, 통계, 의학정보 제시 금지
- 의학적 조언이나 행동을 고치라는 훈계 금지 (일상적인 의견·추천은 괜찮음)
- 친절한 척하는 긴 인사말 금지
- 지금 무슨 이야기가 오갔는지와 상관없이 매번 똑같은 회상 유도 문구로 넘어가는 것 금지

【올바른 예】
"그렇군요. 어떤 때였어요?"
"좋은 추억이네요."
"그럼 그 후엔 어떻게 되셨어요?"
"된장찌개 어때요? 오늘 같은 날 딱이에요."

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

  const [roster, rawMemories, pendingMessages, upcomingPlans] = await Promise.all([
    buildFamilyRoster(patientId),
    latestUserText ? searchMemories(patientId, latestUserText, 3) : Promise.resolve([]),
    takePendingFamilyMessages(patientId),
    buildUpcomingFamilyPlans(patientId),
  ]);

  // AI 자신의 과거 응답(role: assistant)은 "기억"이 아니라 그냥 대화 로그다 - 이걸
  // 참고자료로 다시 넣으면 예전(페르소나 개선 전)의 어색한 응답 패턴이 비슷한 질문에
  // 계속 재소환되어 반복되는 문제가 실사용에서 확인됐다. 환자가 실제로 한 말과
  // 보호자가 등록한 기억만 회상 자료로 쓴다.
  const memories = rawMemories.filter((memory) => memory.role !== "assistant");

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

  if (pendingMessages.length > 0) {
    const list = pendingMessages.map((m) => `- ${m.fromName}: "${m.content}"`).join("\n");
    prompt += `

[아직 전달 안 된 가족 메시지]
가족이 환자에게 남긴 메시지입니다. 대화 시작하고 자연스러운 시점에 딱 한 번 "OO님이
메시지를 남기셨어요, 읽어드릴까요?"처럼 먼저 물어보고, 환자가 원한다고 하면 그때 내용을
전달하세요. 원치 않으면 억지로 읽어주지 마세요. 지금 대화 흐름과 안 맞으면 인사만 하고
넘어가도 됩니다 - 매 턴 반복해서 묻지 마세요.
${list}`;
  }

  if (upcomingPlans) {
    prompt += `

[다가오는 가족 일정]
앞으로 2주 안에 있는 가족 일정입니다. 대화 흐름에 자연스러울 때만 언급하세요
(예: "이번 주말에 손녀가 오신다고 했었죠?"). 매번 먼저 꺼낼 필요는 없습니다.
${upcomingPlans}`;
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
      // ("minimal"은 solar-pro2 전용 값이고 solar-pro3에는 없는 값이라 - Upstage
      // 공식 문서 확인 - 인식 못 된 값은 기본값 "medium"(추론 켜짐, 컨텍스트의 30%까지
      // 추론 토큰 소모)으로 조용히 대체됐을 가능성이 높다. 지금까지 매 요청이 실제로는
      // "최소"가 아니라 "중간" 추론 비용을 그대로 물고 있었던 셈 - 응답 속도에 영향이
      // 컸을 것. solar-pro3가 실제로 지원하는 값(high/medium/low) 중 추론을 완전히
      // 끄는 "low"로 교체.
      reasoning_effort: "low",
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
