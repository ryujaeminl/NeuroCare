import { prisma } from "@/lib/db/prisma";
import { sendSms } from "@/lib/guardian/twilioClient";
import { sendPush } from "@/lib/guardian/webPush";

const ACK_TIMEOUT_MS = 60_000;

// 보호자 앱(neurocare-guardian, ../Neurocaremam)은 별도 오리진에서 뜬다 - 알림 클릭 시
// 그 앱의 URL을 절대경로로 열어야 한다. 아직 그 앱이 배포된 곳이 없어 이 값을 Vercel
// 프로덕션에 설정하지 않았다 - 설정 전까지는 기존처럼 이 앱 안의 상대경로로 그대로
// 동작해야 한다("http://localhost:3001"로 하드코딩하면 실사용자 알림이 전부 깨진다).
const GUARDIAN_APP_URL = process.env.GUARDIAN_APP_URL;

const TRIGGER_LABELS: Record<string, string> = {
  voice_distress: "환자가 도움을 요청하는 말을 했습니다",
  manual_button: "환자가 긴급 호출 버튼을 눌렀습니다",
  session_timeout: "환자와의 대화가 응답 없이 중단되었습니다",
  mood_critical: "환자의 정서 상태가 심각하게 우려됩니다",
};

interface GuardianTarget {
  id: string;
  preference: { phone: string | null } | null;
}

// 환자가 대화 중 실제로 위급함을 나타낼 때 쓰는 표현들. 오탐(예: 드라마 얘기)보다
// 놓치는 쪽이 훨씬 위험하므로 넓게 잡는다 - "아파요"처럼 일상적으로도 쓰이는 말은
// 빼고, 도움 요청/응급 신호에 가까운 표현만 넣는다.
const VOICE_DISTRESS_PHRASES = [
  "살려줘", "살려주세요", "도와줘", "도와주세요", "사람 살려",
  "숨을 못 쉬", "숨이 안 쉬어", "숨쉬기가 힘들",
  "가슴이 너무 아파", "가슴이 답답해서 못 견디",
  "쓰러질 것 같", "쓰러졌", "정신을 잃을 것 같", "눈앞이 캄캄",
  "너무 아파서 움직일 수가 없", "구급차", "119 불러", "119 눌러",
  "배 아파", "배아파", "머리 아파", "몸이 아파", "너무 아파", "아파서",
  "보호자한테 연락", "보호자 연락", "보호자 불러", "연락해줘", "연락해",
];

// 같은 대화에서 위급 표현이 반복돼도 매 턴 보호자에게 새로 알리면 스팸이 된다 -
// 이 시간 안에 이미 열린 voice_distress 이벤트가 있으면 추가 발송을 건너뛴다.
const VOICE_DISTRESS_COOLDOWN_MS = 10 * 60 * 1000;

function normalizeDistressText(text: string): string {
  return text.toLowerCase().replace(/[\s.,!?~"'`()[\]{}:;，。！？]+/g, "");
}

export function detectVoiceDistress(text: string): boolean {
  const normalized = normalizeDistressText(text);
  return VOICE_DISTRESS_PHRASES.some((phrase) => normalized.includes(normalizeDistressText(phrase)));
}

/**
 * /api/chat에서 환자의 최신 발화를 검사해 위급 표현이면 긴급 이벤트를 만들고 보호자에게
 * 알린다. 호출 쪽에서 await하지 않고 fire-and-forget으로 써도 되게 실패를 안으로 삼킨다
 * (긴급 감지 실패가 정상적인 대화 응답을 막으면 안 된다).
 */
export async function maybeTriggerVoiceDistress(patientId: string, latestUserText: string): Promise<void> {
  if (!detectVoiceDistress(latestUserText)) return;

  try {
    const isExplicitDistress = /(살려|도와|119|구해|sos|응급|비상)/i.test(latestUserText);
    if (!isExplicitDistress) {
      const recent = await prisma.emergencyEvent.findFirst({
        where: {
          patientId,
          triggerType: "voice_distress",
          createdAt: { gte: new Date(Date.now() - 30_000) },
        },
      });
      if (recent) return;
    }

    const event = await prisma.emergencyEvent.create({
      data: { patientId, triggerType: "voice_distress", detail: latestUserText.slice(0, 200) },
    });
    await dispatchEmergency(event.id);
  } catch (err) {
    console.error("음성 위급 감지 처리 실패:", err);
  }
}

/**
 * 긴급 이벤트가 생기면 연동된 보호자 전원에게 즉시 푸시를 보낸다. GuardianPreference의
 * 개인화 설정(moodAlertThreshold 등)과 무관하게 전원 발송이다 - alertDispatcher와의 차이.
 * ponytail: 60초 미확인 시 SMS fallback은 setTimeout으로 처리한다 - 이 Node 프로세스가
 * 계속 떠 있는 동안만 동작한다. 여러 인스턴스로 배포하거나 재시작되면 유실될 수 있어서,
 * 운영 환경에서는 DB에 남은 "open" 이벤트를 폴링하는 크론이나 잡 큐로 옮겨야 한다.
 */
export async function dispatchEmergency(eventId: string): Promise<void> {
  const event = await prisma.emergencyEvent.findUnique({
    where: { id: eventId },
    include: { patient: { select: { name: true } } },
  });
  if (!event) return;

  const links = await prisma.patientGuardianLink.findMany({
    where: { patientId: event.patientId },
    select: { guardian: { select: { id: true, preference: { select: { phone: true } } } } },
  });
  if (links.length === 0) return;

  const guardians: GuardianTarget[] = links.map((l) => l.guardian);
  const guardianIds = guardians.map((g) => g.id);
  const subscriptions = await prisma.pushSubscription.findMany({ where: { guardianId: { in: guardianIds } } });

  const body = `${event.patient.name}님 - ${TRIGGER_LABELS[event.triggerType] ?? "확인이 필요합니다"}`;

  const expiredIds: string[] = [];
  await Promise.all(
    subscriptions.map(async (sub) => {
      const emergencyUrl = GUARDIAN_APP_URL
        ? `${GUARDIAN_APP_URL}/emergency/${event.id}`
        : `/guardian/emergency/${event.id}`;
      const result = await sendPush(sub, { title: "긴급 상황", body, url: emergencyUrl });
      if (result.expired) expiredIds.push(sub.id);
    }),
  );
  if (expiredIds.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: expiredIds } } });
  }

  setTimeout(() => {
    void fallbackToSms(event.id, guardians, body);
  }, ACK_TIMEOUT_MS);
}

async function fallbackToSms(eventId: string, guardians: GuardianTarget[], body: string): Promise<void> {
  const current = await prisma.emergencyEvent.findUnique({ where: { id: eventId }, select: { status: true } });
  if (!current || current.status !== "open") return; // 이미 누군가 확인했다.

  await Promise.all(
    guardians.filter((g) => g.preference?.phone).map((g) => sendSms(g.preference!.phone!, `[뉴로케어] ${body}`)),
  );
}
