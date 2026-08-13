import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/authOptions";
import { prisma } from "@/lib/db/prisma";
import { buildFamilyRoster } from "@/lib/memory/familyContext";
import { buildRecentCalendarEvents, buildTodaysNewCalendarEventsContext } from "@/lib/calendar/calendarEvents";
import { buildPreviousSessionContext } from "@/lib/memory/previousSession";
import { buildRecentPlaysContext } from "@/lib/music/recentPlays";
import { buildDueMedicationContext } from "@/lib/medication/dueMedicationContext";
import { buildMorningGreetingContext } from "@/lib/session/wakeGreeting";
import { buildBasePersonaPrompt } from "@/lib/persona";
import type { DementiaStage } from "@/lib/db/types";

// gpt-realtime 배포는 Azure OpenAI 쪽(openai.azure.com) 엔드포인트를 쓴다 - Foundry Claude
// 채팅과 같은 Cognitive Services 리소스/키를 공유하지만 API 형태가 다르고 아직
// @anthropic-ai/foundry-sdk나 openai SDK가 이 GA 엔드포인트를 감싸주지 않아 raw fetch로
// 호출한다. 임시토큰(ephemeral token)은 여기서만 발급하고 실제 키는 브라우저에 절대
// 안 보낸다 - 브라우저는 이 임시토큰으로만 Azure와 WebRTC 연결한다.
const AZURE_RESOURCE = process.env.ANTHROPIC_FOUNDRY_RESOURCE;
const AZURE_API_KEY = process.env.ANTHROPIC_FOUNDRY_API_KEY;
const REALTIME_DEPLOYMENT = process.env.REALTIME_DEPLOYMENT || "gpt-realtime";
// Azure Foundry에 아직 트랜스크립션 모델이 배포되지 않아 기본값을 주지 않는다 - 배포 후
// 이 배포 이름을 env에 채워 넣으면 자동으로 입력 트랜스크립션이 활성화된다.
const REALTIME_TRANSCRIPTION_DEPLOYMENT = process.env.REALTIME_TRANSCRIPTION_DEPLOYMENT;

export async function GET() {
  if (!AZURE_RESOURCE || !AZURE_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_FOUNDRY_RESOURCE / ANTHROPIC_FOUNDRY_API_KEY가 설정되지 않았습니다." },
      { status: 500 },
    );
  }

  let patientId: string | null = null;
  const session = await auth().catch(() => null);
  if (session?.user?.id && session.user.role === "patient") {
    patientId = session.user.id;
  }
  if (!patientId) {
    const firstPatient = await prisma.user.findFirst({ where: { role: "patient" } }).catch(() => null);
    patientId = firstPatient?.id ?? "patient-default";
  }

  const [
    roster,
    patientRecord,
    recentCalendarEvents,
    previousSessionContext,
    recentPlays,
    dueMedicationContext,
    todaysNewCalendarEventsContext,
    morningGreetingContext,
  ] = await Promise.all([
    buildFamilyRoster(patientId).catch(() => null),
    prisma.user.findUnique({ where: { id: patientId }, select: { name: true, dementiaStage: true } }).catch(() => null),
    buildRecentCalendarEvents(patientId).catch(() => null),
    buildPreviousSessionContext(patientId).catch(() => null),
    buildRecentPlaysContext(patientId).catch(() => null),
    buildDueMedicationContext(patientId).catch(() => null),
    buildTodaysNewCalendarEventsContext(patientId).catch(() => null),
    buildMorningGreetingContext(patientId).catch(() => null),
  ]);
  const dementiaStage = (patientRecord?.dementiaStage as DementiaStage | null) ?? "moderate";
  const patientName = patientRecord?.name?.trim() || "어르신";

  // 서버가 UTC로 도는 Vercel이라 그냥 new Date()를 텍스트로 넣으면 한국 자정~오전 9시
  // 사이엔 어제 날짜가 된다 - Asia/Seoul 기준으로 계산한다. 요일도 명시한다 - 모델이
  // 날짜만 보고 요일을 스스로 계산하면 자주 틀려서("다음 주 화요일" 같은 상대 날짜를
  // 절대 날짜로 바꿀 때 반드시 요일이 필요) 환자가 말한 요일과 실제 등록되는 날짜가
  // 어긋나는 원인이 됐다.
  const nowKst = new Date();
  const todayDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(nowKst);
  const todayWeekday = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", weekday: "long" }).format(nowKst);

  let instructions = buildBasePersonaPrompt(dementiaStage) + `

[환자 정보]
현재 대화 중인 환자분의 성함(이름)은 '${patientName}'님입니다.
- 환자가 "내 이름이 뭐야?", "내가 누구야?", "내 이름 알아?", "이름이 뭔데?" 등 자신의 이름에 대해 물어보면 망설임 없이 즉시 "${patientName}님"이라고 정확하고 명확하게 알려주세요.
- 대화 중 환자분을 친근하고 따뜻하게 "${patientName}님"이라고 불러주세요.

[오늘 날짜]
오늘은 ${todayDate}(${todayWeekday})입니다. "내일"/"모레"/"다음 주 화요일"처럼
상대적인 날짜를 언급하면 이 날짜와 요일을 기준으로 정확히 계산하세요 - 요일을
스스로 다시 계산하지 말고 위 요일을 그대로 사용하세요.`;

  if (morningGreetingContext) {
    instructions += `

${morningGreetingContext}`;
  }
  if (roster) {
    instructions += `

[등록된 가족 관계]
아래는 보호자가 미리 등록해 둔, 확인된 가족 관계입니다. 각 줄의 관계는 반드시 "환자 기준"입니다.
예를 들어 "민수: 환자에게 아빠"면 민수님은 환자의 아빠이지 환자의 아들이 아닙니다.
대화 중 가족 이야기가 나오면 이 정보만 사용하고, 관계를 절대 반대로 바꾸거나 추측하지 마세요.
아래 목록에 없는 가족 관계는 지어내지 마세요.
${roster}`;
  }

  if (recentCalendarEvents) {
    instructions += `

[등록된 일정]
과거 60일부터 앞으로 14일 사이에 등록된 일정입니다. "그날 뭐였지", "오늘 8시에 뭐 해야 해?" 등 일정 질문이 들어오면 이 정보에서 날짜와 시간/메모를 확인하여 정확하게 알려주세요. 없는 내용을 지어내지 마세요.
${recentCalendarEvents}`;
  }

  instructions += `

[일정/알림 등록]
대화 중 환자가 일정이나 알림(예: "8시에 알려줘", "내일 병원 가야 해")을 언급하면 자연스럽게 한 번 물어보세요(예: "그거 8시 일정으로 추가해드릴까요?").
강요하지 마세요. 사용자가 명확히 동의했을 때만 add_calendar_event를 호출하고, 시각 정보(예: 08:00 또는 20:00)가 있으면 notes 파라미터나 제목에 함께 전달하세요.`;

  if (todaysNewCalendarEventsContext) {
    instructions += `

${todaysNewCalendarEventsContext}`;
  }

  if (dueMedicationContext) {
    instructions += `

${dueMedicationContext}

[복약 확인]
위 [복용 예정 약]이 있으면, 대화 흐름을 보다가 자연스러운 시점에 한 번 "OO님, 지금
[약이름] 드실 시간이에요. 드셨어요?"처럼 먼저 물어보세요. 강요하지 말고 이미 다른
용건으로 대화가 바쁘면 조금 기다렸다 물어봐도 됩니다. 환자가 "응"/"먹었어"/"드셨어요"
등 긍정으로 답하면 그 즉시 confirm_medication을 medicationId/reminderTime 그대로
호출하세요. "아직"/"이따가" 등 부정이면 호출하지 말고 "네, 이따가 다시 여쭤볼게요"
정도로 짧게 넘어가세요. 확인 안 된 약이 없으면(위 블록이 없으면) 복약 이야기를 먼저
꺼내지 마세요.`;
  }

  if (previousSessionContext) {
    instructions += `

[전날 대화]
가장 최근에 나눈 대화의 일부입니다. 자연스럽게 이어갈 수 있으면 참고하세요.
억지로 언급하거나 그대로 반복하지 마세요.
${previousSessionContext}`;
  }

  if (recentPlays) {
    instructions += `

[최근 들은 노래]
최근에 재생한 곡 목록입니다. 취향을 참고해서 곡을 제안할 때 쓰세요.
없는 곡을 지어내지 마세요.
${recentPlays}
반복 횟수가 높은 곡과 최근 곡을 취향 참고로 사용하세요. 모르는 취향을 단정하지 말고,
구체적인 곡 하나만 제안한 뒤 "틀어드릴까요?"라고 물어보세요.`;
  }

  instructions += `

[긴급 상황 / SOS 알림]
환자가 '배 아파', '머리 아파', '몸이 아파', '아파요', '보호자한테 연락해줘', '보호자 불러줘', '살려줘', '도와줘', 'SOS 신호 보내줘', '119', '비상상황이야' 등 통증이나 위급 상황, 보호자 연락을 표현하면 절대로 '할 수 없다'고 거절하거나 말로만 때우지 마세요! 즉시 trigger_emergency 툴을 호출하고, "보호자분께 긴급 SOS 신호를 즉시 보냈습니다. 안심하세요!"라고 따뜻하게 안심시키세요.

[음악 재생]
"곡 추천해줘"처럼 그냥 추천만 원하는 요청은 tool 호출 없이 말로만 답하세요 -
곡 하나를 골라 이름을 말하고 "틀어드릴까요?"라고 물어보면 끝입니다.
환자가 실제로 재생을 원하면(곡명을 직접 말했든, 방금 추천에 "응"/"틀어줘"라고
동의했든, "다른 곡 틀어줘"처럼 재생 중 다른 곡으로 바꾸고 싶어하든) **반드시
같은 응답 안에서 곧바로 play_song을 호출하세요** - "틀어줄게요" 같은 말만 하고
호출을 안 하면 실제로는 아무 노래도 안 나갑니다. 재생 시작 확인 문구("~을 틀어드릴게요"
등)는 play_song 호출 결과가 온 뒤에 말하세요, 호출 전에 먼저 말하고 끝내지
마세요. 이미 재생 중이어도 play_song만 다시 호출하면 자동으로 새 곡으로
바뀌니 stop_song을 먼저 부를 필요 없습니다. stop_song은 "그만"처럼 재생을
완전히 멈추라는 요청일 때만 호출하세요.`;

  if (!REALTIME_TRANSCRIPTION_DEPLOYMENT) {
    console.error(
      "REALTIME_TRANSCRIPTION_DEPLOYMENT가 설정되지 않아 입력 트랜스크립션이 비활성화됩니다 - 응급감지/음성 기반 대화종료 기능이 동작하지 않습니다. Azure Foundry에 트랜스크립션 모델을 배포한 뒤 env를 설정하세요.",
    );
  }

  const audio = REALTIME_TRANSCRIPTION_DEPLOYMENT
    ? {
        output: { voice: "marin" },
        input: { transcription: { model: REALTIME_TRANSCRIPTION_DEPLOYMENT } },
      }
    : { output: { voice: "marin" } };

  const azureRes = await fetch(
    `https://${AZURE_RESOURCE}.openai.azure.com/openai/v1/realtime/client_secrets`,
    {
      method: "POST",
      headers: { "api-key": AZURE_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model: REALTIME_DEPLOYMENT,
          instructions,
          audio,
          tools: [{
            type: "function",
            name: "trigger_emergency",
            description: "환자가 '살려줘', '도와줘', 'SOS 신호 보내' 등 위급 상황이나 긴급 알림 요청을 할 때 즉시 호출하여 보호자에게 SOS 신호를 송출합니다.",
            parameters: {
              type: "object",
              properties: { detail: { type: "string", description: "환자의 위급 상황 내용 (예: 살려줘 요청, 통증, 긴급 SOS 요청 등)" } },
            },
          }, {
            type: "function",
            name: "web_search",
            description: "최신 정보가 필요할 때 공개 웹을 검색합니다.",
            parameters: {
              type: "object",
              properties: { query: { type: "string", description: "검색할 질문" } },
              required: ["query"],
            },
          }, {
            type: "function",
            name: "confirm_medication",
            description: "환자가 약을 먹었다고 확인했을 때 호출해 복약 알림을 해제합니다.",
            parameters: {
              type: "object",
              properties: {
                medicationId: { type: "string", description: "[복용 예정 약]에 제공된 medicationId 그대로" },
                reminderTime: { type: "string", description: "[복용 예정 약]에 제공된 reminderTime 그대로(HH:MM)" },
              },
              required: ["medicationId", "reminderTime"],
            },
          }, {
            type: "function",
            name: "add_calendar_event",
            description: "환자가 언급한 일정/알림을 사용자가 명확히 동의했을 때만 호출해 등록합니다.",
            parameters: {
              type: "object",
              properties: {
                title: { type: "string", description: "일정/알림 제목 (예: 오후 8시 약 드시기, 8시 안부 확인 등 시각/내용 포함)" },
                date: { type: "string", description: "YYYY-MM-DD" },
                notes: { type: "string", description: "상세 시각이나 메모 (예: 20:00 또는 08:00)" },
              },
              required: ["title", "date"],
            },
          }, {
            type: "function",
            name: "play_song",
            description: "사용자가 동의한 노래를 검색해서 재생합니다.",
            parameters: {
              type: "object",
              properties: { query: { type: "string", description: "검색할 곡명(가수 포함 가능)" } },
              required: ["query"],
            },
          }, {
            type: "function",
            name: "stop_song",
            description: "재생 중인 노래를 멈춥니다.",
            parameters: { type: "object", properties: {} },
          }],
        },
      }),
    },
  );

  if (!azureRes.ok) {
    const detail = await azureRes.text().catch(() => "");
    return NextResponse.json(
      { error: `Azure Realtime 토큰 발급 실패 (${azureRes.status}): ${detail}` },
      { status: 502 },
    );
  }

  const data = (await azureRes.json()) as { value?: string };
  if (!data.value) {
    return NextResponse.json({ error: "토큰 응답에 value가 없습니다." }, { status: 502 });
  }

  return NextResponse.json({ token: data.value, resource: AZURE_RESOURCE, deployment: REALTIME_DEPLOYMENT });
}
