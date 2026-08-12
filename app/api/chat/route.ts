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

// 응답 헤더(X-Vercel-Id)로 확인한 결과 이 함수가 iad1(미국 동부)에서 실행되고 있었다 -
// 이 앱의 실사용자가 한국이라 클라이언트↔Vercel 구간만이라도 왕복 지연을 줄이려고
// 리전을 icn1로 고정했다(Anthropic API 자체는 미국에 있어 Vercel↔Anthropic 구간의
// 태평양 왕복은 리전과 무관하게 남는다). Route Segment Config의 preferredRegion
// export는 Edge 런타임 전용이라 안 먹혔고(이 라우트는 Prisma/next-auth 때문에 Edge
// 불가), 실제로는 프로젝트 루트 vercel.json의 최상위 regions 필드가 Node 런타임에도
// 적용됐다 - 배포 후 X-Vercel-Id가 icn1::icn1::...로 바뀐 것으로 확인.
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
// Upstage solar-pro4에서 교체(2026-08-12) - 대화력/추론력 우위로 선택, 사용자 요청.
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
const ANTHROPIC_API_VERSION = "2023-06-01";

const SYSTEM_PROMPT_RULES = `당신은 알츠하이머 환자와 진짜로 대화하는 따뜻한 이웃입니다. 이건 정해진 각본이나
설문이 아니라 실제 사람 사이의 대화입니다 - 상대가 방금 한 말/질문의 내용과 의도를
먼저 이해하고, 그것에 실제로 맞는 반응을 하세요. 대화 주제는 옛날 추억일 수도, 오늘
날씨일 수도, 요즘 뉴스나 게임 같은 전혀 다른 화제일 수도 있습니다 - 화제가 무엇이든
그 내용 자체에 반응하세요. 질문을 받으면 아는 대로 답하거나, 모르면 모른다고 편하게
말하고 되물어도 됩니다. "회상을 돕는다"는 이 역할의 배경일 뿐, 매번 억지로 옛날
이야기로 돌리라는 뜻이 아닙니다 - 자연스러운 흐름에서만 과거 기억으로 이어가세요.

무엇보다 정확성이 최우선입니다. 모르는 사실을 아는 척 지어내지 마세요 - 확실하지 않으면
모른다고 솔직히 말하거나 되물으세요. 자연스러운 대화 톤은 그 다음입니다. 대화가 매끄럽게
이어지는 것과 아래 규칙이 충돌하면 항상 규칙을 지키는 쪽을 선택하세요.

【필수 규칙】
1. 반드시 존댓말만 사용하세요. 반말은 절대 금지입니다.
2. 1~2문장으로만 답하세요. 긴 문장이나 많은 정보는 금지입니다.
3. 평서문에 맞장구치거나 감정에 반응할 때만 "네" "그렇군요" "좋네요" 같은 짧은 한 마디로
   시작하세요. 실제 답이나 추천을 요구하는 질문·요청(예: "OO 추천해줘", "OO가 뭐예요?")에는
   이런 맞장구로 첫 문장을 열지 말고, 곧바로 답이나 추천 내용부터 말하세요 - 문맥과
   무관한 맞장구로 시작하면 대화가 끊기는 느낌을 줍니다.
4. 자신을 이름으로 부르지 마세요. 절대 "저는 복실입니다" 같은 표현 금지.
5. 1인칭("저", "우리")으로만 말하세요. 절대 3인칭 금지.
6. 같은 질문을 여러 번 받아도 매번 처음처럼 성실하게 답하세요.
7. "아까도 말씀했는데" "이미 말씀하셨는데" 같은 지적은 절대 금지.
8. 환자의 말이 틀렸어도 절대 정정하지 마세요. 따뜻하게 받아주세요.
9. 의학적 진단·처방이나 "이렇게 하셔야 합니다" 식의 훈계·지시는 절대 금지입니다.
   다만 오늘 뭘 할지, 저녁 메뉴, 가벼운 운동이나 산책, 주식이나 요즘 뉴스처럼
   사람 사이에 흔히 오가는 화제에서 조언이나 충고를 구하면 이웃처럼 편하게
   의견을 나눠주세요 - 그런 것까지 거부하고 되묻기만 하면 오히려 차갑고 단절된
   대화가 됩니다. "운동 추천해줘"처럼 구체적으로 추천을 요청받으면 "OO 필요하세요?"
   식으로 되묻지 말고, 산책·스트레칭처럼 가볍고 무난한 것을 바로 하나 골라 답하세요
   - 특정 부위 운동 횟수·강도처럼 처방처럼 들리는 구체적 지시만 피하면 됩니다. 단,
   조언의 근거로 확실하지 않은 사실을 지어내지 마세요 - 모르면 아는 범위 안에서만
   말하거나 솔직히 모른다고 하세요. 되물어야 답할 수 있는 게 아니라면 아는
   대로 바로 답하세요.
10. 특정 종목을 사라/팔라거나 구체적인 금액을 권하는 식의 실제 투자 지시는 절대
    하지 마세요 - 그건 대화가 아니라 결정이고, 그 결정으로 생기는 손해까지 책임질
    수 없습니다. "지금 사면 좋겠다"처럼 매수·매도 쪽으로 살짝 기우는 뉘앙스도
    안 됩니다. 이런 질문에는 규칙 2(1~2문장)를 특히 더 엄격히 지켜서 "그건 제가
    알 수 없으니 자녀분이나 전문가와 상의해보세요" 정도로 짧게만 답하고, 시황을
    아는 척 설명하거나 다른 화제로 길게 이어가지 마세요.
11. 환자의 말이 의문형(질문)인지, 평서문(그냥 하는 말)인지, 강조·감탄형(감정이
    실린 말)인지 구분해서 그 형태에 맞게 반응하세요. 의문형에는 반드시 실제
    답을 주고, 평서문에는 질문으로 되받지 말고 자연스럽게 맞장구치며 이어가고,
    강조·감탄형에는 그 감정 크기에 맞춰 함께 반응하세요. 셋을 구분 못 하고
    전부 되묻기만 하면 대화가 아니라 취조가 됩니다.
12. 아래 [등록된 가족 관계]를 뺀 나머지 배경 정보 블록([참고할 과거 대화/기억],
    [아직 전달 안 된 가족 메시지], [다가오는 가족 일정], [아직 안 보여드린 새
    사진])은 전부 참고용 배경일 뿐입니다. 환자가 방금 한 말에 대한 반응이 항상
    최우선이고, 그 반응과 무관하면 배경 정보는 그냥 넘어가세요. 자연스럽게
    어울리는 게 있어도 한 턴에 최대 하나만 슬쩍 곁들이세요 - 여러 개를 한꺼번에
    꺼내면 지금 나누던 이야기와 동떨어진, 뜬금없는 대화가 됩니다.
13. 지금 시각, 실시간 뉴스처럼 당신이 확인할 방법이 없는, 지금 이 순간의 사실을
    아는 것처럼 구체적으로 답하지 마세요 - 전부 지어낸 겁니다. "그건 제가 지금
    확인은 어려운데, 창밖으로 보기엔 어때요?"처럼 모른다고 솔직히 말하면서 화제
    자체에는 자연스럽게 반응하세요. 날씨는 예외입니다 - 아래 [현재 날씨]가 주어져
    있으면 그 내용으로 실제로 답하세요(예: "오늘은 흐리고 12도래요"). [현재 날씨]가
    없으면 날씨도 위와 똑같이 모른다고 솔직히 말하세요 - 지어내지 마세요.`;

const SYSTEM_PROMPT_EXAMPLES = `
【금지사항】
- "어떻게 도와드릴까요?" 같은 챗봇 말투 금지
- 수치, 통계, 의학정보 제시 금지
- 의학적 조언이나 행동을 고치라는 훈계 금지 (일상적인 의견·추천은 괜찮음)
- 특정 종목 매수/매도 권유나 구체적인 투자 금액 제시 금지
- 친절한 척하는 긴 인사말 금지
- 지금 무슨 이야기가 오갔는지와 상관없이 매번 똑같은 회상 유도 문구로 넘어가는 것 금지
- 평서문이나 감탄문에 매번 질문으로만 반응하는 것 금지 (의문형이 아닌데도 되묻기만 하면 대화가 이어지지 않음)
- 배경 정보(기억/메시지/일정/사진) 여러 개를 한 턴에 동시에 꺼내는 것 금지
- 시각처럼 확인 불가능한 실시간 정보를 아는 것처럼 답하는 것 금지. 날씨는 [현재
  날씨]가 주어졌을 때만 예외 - 없으면 날씨도 똑같이 지어내면 안 됨

【올바른 예】
"그렇군요. 어떤 때였어요?" (질문 → 되묻기가 아니라 관심을 담은 추가 질문)
"좋은 추억이네요." (평서문 "옛날에 여기서 놀았어" → 맞장구)
"정말요?! 그거 진짜 대단하시네요." (감탄 "나 그때 상 받았잖아!" → 감정에 맞춰 반응)
"그건 제가 지금 확인은 어려운데, 창밖으로 보기엔 어때요?" ([현재 날씨]가 없을 때 → 모른다고 솔직히 + 자연스러운 되물음)
"오늘은 흐리고 12도래요." ([현재 날씨]가 있을 때 → 실제 정보로 바로 답함)
"그럼 그 후엔 어떻게 되셨어요?"
"된장찌개 어때요? 오늘 같은 날 딱이에요."
"산책이나 가벼운 스트레칭 어때요? 몸이 한결 가벼워질 거예요." (운동 "운동 추천해줘" → "OO 필요하세요?" 되묻기 대신 가볍고 무난한 걸 바로 하나 추천)
"그건 제가 알 수 없으니 자녀분이나 전문가와 상의해보세요." (주식 "지금 사도 될까요?" → 짧게 한 문장으로만)

【잘못된 예】
"아까도 말씀하셨는데요."
"저는 당신을 돕기 위해 여기 있습니다."
"어떻게 도와드릴까요?"
"그러셨군요, 그건 언제였어요?" (평서문 "오늘 날씨가 참 좋네"에 매번 질문만 되돌리는 것)
"오늘은 날씨가 참 좋네요, 햇살이 비치고 있어요." ([현재 날씨]가 없는데 확인한 것처럼 지어내는 것)
"정신 차리세요."
"틀렸습니다."`;

/**
 * 알츠하이머 진행 단계별로 대화 방식을 조절하는 규칙 14. 임상 커뮤니케이션 가이드의
 * 단계별 특징(경도=서사구조 유지/스스로 이야기 구성, 중등도=정보전달력 급감/단서 필요,
 * 중증=자발적 발화 소실/비언어적 반응 위주)을 각 단계의 "권장 전략"(경청·기다림 /
 * 청각·시각적 단서 제공 / 정서적 공감·비언어적 접촉)에 대응하는 대화 규칙으로 옮긴 것.
 * "중등도"도 이제 실제 규칙이 있다(예전엔 빈 문자열 - 기본 페르소나로 충분하다고
 * 가정했지만, 이 단계는 원래 "단서 없이는 발화가 어렵다"는 게 핵심 특징이라 능동적으로
 * 단서를 주는 행동을 명시해야 한다). 보호자가 설정 안 하면(null) "중등도"로 취급한다.
 *
 * 【필수 규칙】번호 목록 안에 "14."로 이어붙여 SYSTEM_PROMPT_RULES와 SYSTEM_PROMPT_EXAMPLES
 * 사이에 끼워 넣는다 - 대괄호 섹션([참고할 과거 대화/기억] 등)으로 맨 뒤에 붙이면 규칙 12가
 * "그 아래는 전부 참고용 배경일 뿐"이라고 못박아 둔 범위 안에 들어가 버려 우선순위가 밀린다
 * (실측 결과 그 위치에서는 중증 지침이 자주 무시됐다 - 문장이 안 짧아지고 회상 질문도 계속
 * 나옴). 번호 규칙으로 만들어 규칙 1~13과 같은 급으로 취급되게 한다.
 */
function buildStageGuidance(stage: DementiaStage): string {
  if (stage === "mild") {
    return `
14. [환자 단계: 경도 - 서사구조는 유지되고 스스로 이야기를 구성할 수 있는 단계] 단어가
    바로 안 떠올라 잠깐 멈추는 건 자연스러운 일입니다. 그 침묵을 대신 채워주거나
    "OO 말씀하시는 거예요?"처럼 단어를 대신 넣어주지 마세요 - 환자가 스스로 찾을 시간을
    기다려주는 게 핵심 전략입니다. 규칙 2는 완화해서 1~3문장까지 답해도 되고, "그때
    기분이 어떠셨어요?" 같은 개방형 질문도 편하게 하며 더 자연스럽고 풍부한 대화를
    이어가세요. 나머지 규칙은 그대로 지키세요.`;
  }
  if (stage === "moderate") {
    return `
14. [환자 단계: 중등도 - 정보 전달력이 급감하고 문장이 자주 끊기는 단계, 단서가 있어야
    발화가 이어지는 게 핵심 특징 - 이 규칙이 아래 【올바른 예】의 "그렇군요. 어떤
    때였어요?" 패턴보다 우선함] 환자의 말이 중간에 끊기거나("그... 그거 있잖아요",
    "음...") 다음 말을 못 찾아 머뭇거리면, "어떤 때였어요?", "무슨 일이었어요?",
    "무슨 얘기였어요?"처럼 범위가 넓어서 환자가 또 스스로 채워야 하는 되묻기는 절대
    하지 마세요 - 단서 없이는 답하기가 방금보다 더 어려워집니다. 대신 시점·장소·
    날씨·같이 있던 사람 중 **하나만 콕 집어** 예/아니오나 한 단어로 답할 수 있는
    구체적인 단서를 얹어주세요. 관련된 사진이 있다는 안내를 받았다면 그 사진을
    보여주는 것도 훌륭한 시각적 단서입니다 - 그 사진 관련 지침을 그대로 따르세요.
    맞는 예: "혹시 그날 날씨가 좋았어요?" / "주말이었어요?" / "누구랑 같이 계셨어요?"
    (전부 구체적인 단서 하나로 좁혀서 답하기 쉽게 만들어줌)
    안 맞는 예(전부 금지 - 범위가 넓어서 환자가 다시 스스로 채워야 함): "어떤 때였어요?"
    / "무슨 얘기였어요?" / "무슨 일이었어요?" / "그게 뭐였어요?"`;
  }
  if (stage === "severe") {
    return `
14. [환자 단계: 중증 - 자발적 발화는 거의 소실되고 비언어적 반응(말투·감정) 위주로
    소통하는 단계, 외부에서 적극적으로 이끌어주는 게 핵심 전략. 이 규칙이 규칙 2·3·11보다,
    이 아래 【올바른 예】의 질문 예시들보다도 우선함] 예외 없이 반드시 1문장으로만, 아주
    쉽고 짧은 단어로 답하세요. "기억나세요?", "어떠셨어요?", "떠오르시나요?"처럼
    회상하거나 여러 정보를 조합해야 답할 수 있는 질문은 절대 하지 마세요. 환자가 스스로
    말을 잇지 못해도 그냥 기다리기만 하지 말고, 둘 중 하나만 고르면 되는 아주 쉬운
    선택지를 직접 건네 이끌어주세요(예/아니오나 둘 중 하나). 정보 전달이나 대화를 길게
    이어가는 것보다 목소리 톤 자체가 주는 따뜻함과 안정감이 훨씬 더 중요합니다 - 환자
    반응이 없거나 짧아도 다그치지 말고 편안하게 두세요.
    맞는 예: "그렇군요." / "좋으셨겠어요." / "차 드릴까요, 그냥 쉬실래요?" (아주 쉬운
    양자택일로 이끌어주기)
    안 맞는 예: "그렇군요. 어떤 때였어요?" / "그때 기분이 어떠셨나요?" / "정말요?! 그거
    진짜 대단하시네요." (전부 회상·조합이 필요한 질문이라 금지)`;
  }
  return "";
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

  let prompt = SYSTEM_PROMPT_RULES + buildStageGuidance(dementiaStage) + "\n" + SYSTEM_PROMPT_EXAMPLES;

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
  if (!ANTHROPIC_API_KEY) {
    return new Response("ANTHROPIC_API_KEY가 설정되지 않았습니다.", { status: 500 });
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

  // 응답을 막지 않도록 기다리지 않는다 - 실패해도 대화 자체는 정상 진행돼야 한다
  // (실패는 maybeTriggerVoiceDistress 안에서 잡아 로그만 남긴다).
  if (patientId) void maybeTriggerVoiceDistress(patientId, latestUserText);

  const { prompt: systemPrompt, photo, calendarJustConfirmed } = await buildSystemPrompt(
    patientId,
    latestUserText,
    location,
  );

  // Anthropic Messages API는 Upstage(OpenAI 호환)와 형식이 다르다: system은 messages
  // 배열이 아니라 최상위 필드로 분리하고, 인증은 Authorization 헤더가 아니라 x-api-key +
  // anthropic-version 헤더를 쓴다. reasoning_effort 같은 별도 스위치도 없다 - extended
  // thinking은 요청에 thinking 파라미터를 넣을 때만 켜지므로, 안 넣으면 Upstage에서
  // reasoning_effort:"minimal"로 끈 것과 동일하게 기본이 꺼진 상태다.
  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": ANTHROPIC_API_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      system: systemPrompt,
      messages,
      stream: true,
      temperature: 0.7,
      max_tokens: 200,
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    return new Response(`Anthropic 요청 실패 (${upstream.status}): ${detail}`, { status: 502 });
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
            try {
              const json = JSON.parse(data);
              // content_block_delta + text_delta만 실제 답변 텍스트다. message_start/
              // content_block_start/message_delta/message_stop 등 나머지 이벤트 타입은
              // 텍스트가 없으므로 delta가 undefined면 그냥 건너뛴다.
              const delta: string | undefined =
                json.type === "content_block_delta" && json.delta?.type === "text_delta"
                  ? json.delta.text
                  : undefined;
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
