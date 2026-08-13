import { NextRequest } from "next/server";
import { auth } from "@/lib/auth/authOptions";
import { prisma } from "@/lib/db/prisma";
import {
  buildFamilyRoster,
  buildUpcomingFamilyPlans,
  pickMessagePhotoToShow,
  takePendingFamilyMessages,
} from "@/lib/memory/familyContext";
import { maybeTriggerVoiceDistress } from "@/lib/guardian/emergencyDispatcher";
import { searchMemories } from "@/lib/memory/pineconeClient";
import { getUnofferedPhotoPrompt, pickPhotoToShow } from "@/lib/memory/photoContext";
import { buildWeatherContext } from "@/lib/weather";
import { buildRecentCalendarEvents, handleCalendarTurn } from "@/lib/calendar/calendarEvents";
import type { DementiaStage } from "@/lib/db/types";
import { buildBasePersonaPrompt, SYSTEM_PROMPT_RULES, SYSTEM_PROMPT_EXAMPLES } from "@/lib/persona";

// 응답 헤더(X-Vercel-Id)로 확인한 결과 이 함수가 iad1(미국 동부)에서 실행되고 있었다 -
// 이 앱의 실사용자가 한국이라 클라이언트↔Vercel 구간만이라도 왕복 지연을 줄이려고
// 리전을 icn1로 고정했다(모델 자체는 미국에 있어 Vercel↔Azure 구간의 태평양 왕복은
// 리전과 무관하게 남는다). Route Segment Config의 preferredRegion export는 Edge
// 런타임 전용이라 안 먹혔고(이 라우트는 Prisma/next-auth 때문에 Edge 불가), 실제로는
// 프로젝트 루트 vercel.json의 최상위 regions 필드가 Node 런타임에도 적용됐다 -
// 배포 후 X-Vercel-Id가 icn1::icn1::...로 바뀐 것으로 확인.
// claude-sonnet-5 Foundry 배포가 없어 대화가 항상 실패하던 문제로, 같은 Azure
// 리소스(youjaemin0722-2893-resource)에 실제로 배포돼있는 gpt-5.5로 교체했다
// (app/api/realtime/web-search/route.ts와 동일한 Azure OpenAI Responses API,
// 모델만 다름 - 검색은 mini로 충분하지만 메인 대화는 품질이 더 중요해 mini
// 아닌 배포를 쓴다).
const AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;
const AZURE_OPENAI_API_KEY = process.env.AZURE_OPENAI_API_KEY;
const CHAT_MODEL = process.env.AZURE_OPENAI_CHAT_MODEL ?? "gpt-5.5";

/** Azure OpenAI Responses API 스트리밍 이벤트 중 텍스트 델타만 필요한 필드로 타입화한다. */
interface ResponsesApiStreamEvent {
  type: string;
  delta?: string;
}

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface PhotoToShow {
  url: string;
  caption: string | null;
}

interface SystemPromptResult {
  prompt: string;
  /** 이번 턴에 환자 화면에 띄울 사진(동의 후, 또는 회상 중 자연스럽게). 없으면 null. */
  photo: PhotoToShow | null;
  /** 이번 턴에 방금 일정이 확인·저장됐으면 true - 클라이언트에 동기화를 트리거해야 한다. */
  calendarJustConfirmed: boolean;
}

/**
 * 보호자 앱에서 입력한 가족 관계 + 과거 대화/기억 중 지금 발화와 비슷한 것을 찾아
 * 시스템 프롬프트에 덧붙인다. "지난번에 말씀하신 손주 이야기"처럼 자연스러운 회상을
 * 유도하기 위함이다. 둘 다 없으면(가족 미등록 + Pinecone 미설정) 프롬프트가 그대로 유지된다.
 */
async function buildSystemPrompt(
  patientId: string | null,
  latestUserText: string,
  location: { lat: number; lon: number } | undefined,
): Promise<SystemPromptResult> {
  // 위치는 로그인 여부와 무관하게 브라우저에서 오는 값이라, 비로그인 대화(위 "비로그인도
  // 대화는 가능" 참고)에서도 날씨는 그대로 답할 수 있어야 한다.
  const weather = await buildWeatherContext(location);
  const weatherBlock = weather ? `\n\n[현재 날씨]\n${weather}` : "";

  if (!patientId) {
    return {
      prompt: SYSTEM_PROMPT_RULES + "\n" + SYSTEM_PROMPT_EXAMPLES + weatherBlock,
      photo: null,
      calendarJustConfirmed: false,
    };
  }

  const [
    roster,
    rawMemories,
    pendingMessages,
    upcomingPlans,
    unofferedPhotoPrompt,
    patientRecord,
    calendarTurn,
    recentCalendarEvents,
  ] = await Promise.all([
    buildFamilyRoster(patientId),
    latestUserText ? searchMemories(patientId, latestUserText, 3) : Promise.resolve([]),
    takePendingFamilyMessages(patientId),
    buildUpcomingFamilyPlans(patientId),
    getUnofferedPhotoPrompt(patientId),
    prisma.user.findUnique({ where: { id: patientId }, select: { dementiaStage: true } }),
    handleCalendarTurn(patientId, latestUserText),
    buildRecentCalendarEvents(patientId),
  ]);
  const dementiaStage = (patientRecord?.dementiaStage as DementiaStage | null) ?? "moderate";
  // ponytail: 진단용. 위와 같은 이유로 남긴다 - patientId는 잡혔는데 대기 중인 가족
  // 메시지가 실제로 몇 건 조회됐는지 원격에서 확인한다. 0이면 애초에 DB에 안 쌓였거나
  // 이미 delivered 처리된 것, 1개 이상이면 프롬프트엔 들어갔는데 AI가 안 꺼낸 것으로
  // 원인을 좁힐 수 있다. 원인이 잡히면 지운다.
  console.error(`[chat] patientId=${patientId} 대기 중인 가족 메시지=${pendingMessages.length}건`);

  // AI 자신의 과거 응답(role: assistant)은 "기억"이 아니라 그냥 대화 로그다 - 이걸
  // 참고자료로 다시 넣으면 예전(페르소나 개선 전)의 어색한 응답 패턴이 비슷한 질문에
  // 계속 재소환되어 반복되는 문제가 실사용에서 확인됐다. 환자가 실제로 한 말과
  // 보호자가 등록한 기억만 회상 자료로 쓴다.
  const memories = rawMemories.filter((memory) => memory.role !== "assistant");

  // 이번 턴 회상(RAG)이 짚은 "보호자가 등록한 기억"에 딸린 사진이 있으면, 혹은 방금
  // "보여드릴까요?"에 환자가 그렇다고 답했으면 pickPhotoToShow가 골라준다. 두 사진
  // 후보가 같은 턴에 동시에 나올 일은 거의 없지만(회상 기억 vs 방금 온 메시지),
  // 혹시 겹치면 회상 매칭 쪽을 우선한다 - 방금 나누던 대화와 더 직접 연결돼 있어서다.
  const matchedMemoryIds = memories.filter((m) => m.kind === "family_memory").map((m) => m.id);
  const photo: PhotoToShow | null =
    (await pickPhotoToShow(patientId, latestUserText, matchedMemoryIds)) ??
    (await pickMessagePhotoToShow(patientId, latestUserText));

  let prompt = buildBasePersonaPrompt(dementiaStage);

  if (roster) {
    prompt += `

[등록된 가족 관계]
아래는 보호자가 미리 등록해 둔, 확인된 가족 관계입니다. 각 줄의 관계는 반드시 "환자 기준"입니다.
예를 들어 "민수: 환자에게 아빠"면 민수님은 환자의 아빠이지 환자의 아들이 아닙니다.
대화 중 가족 이야기가 나오면 이 정보만 사용하고, 관계를 절대 반대로 바꾸거나 추측하지 마세요.
아래 목록에 없는 가족 관계는 지어내지 마세요.
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
    const list = pendingMessages
      .map((m) => `- ${m.fromName}: "${m.content}"${m.hasPhoto ? " (사진도 함께 보내셨습니다)" : ""}`)
      .join("\n");
    prompt += `

[아직 전달 안 된 가족 메시지]
가족이 환자에게 남긴 메시지입니다. 대화 시작하고 자연스러운 시점에 딱 한 번 "OO님이
메시지를 남기셨어요, 읽어드릴까요?"처럼 먼저 물어보고, 환자가 원한다고 하면 그때 내용을
전달하세요. "(사진도 함께 보내셨습니다)"라고 되어 있으면, 환자가 원한다고 답하는 순간
시스템이 화면에 사진을 자동으로 띄워주니 "네, 사진도 같이 보내셨어요, 여기 있어요"
정도로만 자연스럽게 반응하세요 - 사진 내용을 직접 묘사하려 하지 마세요(아직 무슨
사진인지 알 수 없습니다). 원치 않으면 억지로 읽어주지 마세요. 지금 대화 흐름과 안 맞으면
인사만 하고 넘어가도 됩니다 - 매 턴 반복해서 묻지 마세요.
${list}`;
  }

  if (upcomingPlans) {
    prompt += `

[다가오는 가족 일정]
앞으로 2주 안에 있는 가족 일정입니다. 대화 흐름에 자연스러울 때만 언급하세요
(예: "이번 주말에 손녀가 오신다고 했었죠?"). 매번 먼저 꺼낼 필요는 없습니다.
${upcomingPlans}`;
  }

  if (recentCalendarEvents) {
    prompt += `

[등록된 일정]
과거 60일부터 앞으로 14일 사이에 등록된 일정입니다. "그날 뭐였지" 같은 질문에
관련 있을 때만 이 정보로 답하세요. 없는 내용을 지어내지 마세요.
${recentCalendarEvents}`;
  }

  prompt += calendarTurn.promptBlock;

  prompt += unofferedPhotoPrompt + weatherBlock;

  return { prompt, photo, calendarJustConfirmed: calendarTurn.justConfirmed };
}

export async function POST(request: NextRequest) {
  if (!AZURE_OPENAI_ENDPOINT || !AZURE_OPENAI_API_KEY) {
    return new Response(
      "AZURE_OPENAI_ENDPOINT / AZURE_OPENAI_API_KEY가 설정되지 않았습니다.",
      { status: 500 },
    );
  }

  const { messages, location } = (await request.json()) as {
    messages: ChatMessage[];
    location?: { lat: number; lon: number };
  };

  // 로그인 상태면 그 환자의 과거 대화를 검색해 컨텍스트로 넣는다(비로그인도 대화는 가능).
  const session = await auth();
  const patientId = session?.user?.role === "patient" ? session.user.id : null;
  const latestUserText = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  // ponytail: 진단용. 보호자가 메시지를 남겼는데 환자 화면에서 전달이 안 됐다는 보고가
  // 있어, 애초에 patientId가 안 잡혀 비로그인(익명) 경로로 빠진 건 아닌지 원격에서
  // 바로 확인하려고 남긴다. 원인이 잡히면 지운다.
  if (!patientId) {
    console.error(`[chat] 비로그인 상태로 대화 진행 - 세션=${session ? "있음(role 불일치)" : "없음"}`);
  }

  // 긴급 표현은 서버리스 응답 이후에 유실되지 않도록 먼저 확정 처리한다.
  // 실패는 maybeTriggerVoiceDistress 안에서 잡아 로그만 남긴다.
  if (patientId) await maybeTriggerVoiceDistress(patientId, latestUserText);

  const { prompt: systemPrompt, photo, calendarJustConfirmed } = await buildSystemPrompt(
    patientId,
    latestUserText,
    location,
  );

  const encoder = new TextEncoder();
  let azureResponse: Response;
  try {
    azureResponse = await fetch(`${AZURE_OPENAI_ENDPOINT.replace(/\/$/, "")}/openai/v1/responses`, {
      method: "POST",
      headers: { "api-key": AZURE_OPENAI_API_KEY, "content-type": "application/json" },
      body: JSON.stringify({
        model: CHAT_MODEL,
        instructions: systemPrompt,
        input: messages.map((m) => ({ role: m.role, content: m.content })),
        stream: true,
        temperature: 0.7,
        max_output_tokens: 200,
      }),
    });
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    return new Response(`Azure OpenAI 요청 실패: ${detail}`, { status: 502 });
  }

  if (!azureResponse.ok || !azureResponse.body) {
    const detail = await azureResponse.text().catch(() => "");
    return new Response(`Azure OpenAI 요청 실패 (${azureResponse.status}): ${detail}`, { status: 502 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const reader = azureResponse.body!.getReader();
      const decoder = new TextDecoder();
      // SSE 프레임이 청크 경계에서 잘려 올 수 있어 줄 단위로 버퍼링한다 - "data: {...}"
      // 한 줄이 완성될 때만 파싱한다.
      let buffer = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const payload = line.startsWith("data: ") ? line.slice(6).trim() : "";
            if (!payload || payload === "[DONE]") continue;
            let event: ResponsesApiStreamEvent;
            try {
              event = JSON.parse(payload) as ResponsesApiStreamEvent;
            } catch {
              continue;
            }
            // response.output_text.delta만 실제 답변 텍스트 조각이다. 나머지 이벤트
            // 타입(response.created/response.output_item.added/response.completed 등)은
            // 텍스트가 없다.
            if (event.type === "response.output_text.delta" && event.delta) {
              controller.enqueue(encoder.encode(event.delta));
            }
          }
        }
        controller.close();
      } catch (error: unknown) {
        // close()를 또 부르면 "이미 error/close된 컨트롤러" 예외가 나므로 error()만 부른다.
        controller.error(error);
      }
    },
  });

  // 사진 URL/캡션은 한글을 포함할 수 있어 HTTP 헤더에 그대로 못 넣는다 - encodeURIComponent로
  // ASCII화하고, 클라이언트(lib/llmStream.ts)에서 decodeURIComponent로 되돌린다.
  const headers: Record<string, string> = { "Content-Type": "text/plain; charset=utf-8" };
  if (photo) {
    headers["X-Photo-Url"] = encodeURIComponent(photo.url);
    if (photo.caption) headers["X-Photo-Caption"] = encodeURIComponent(photo.caption);
  }
  if (calendarJustConfirmed) headers["X-Calendar-Sync"] = "1";

  return new Response(stream, { headers });
}
