import { prisma } from "@/lib/db/prisma";
import { sendSms } from "@/lib/guardian/twilioClient";
import { sendPush } from "@/lib/guardian/webPush";

const ACK_TIMEOUT_MS = 60_000;

// 보호자 앱(../Neurocaremam)은 별도 오리진에서 뜬다 - 알림 클릭 시 그 앱의 URL을 절대경로로 열어야 한다.
const GUARDIAN_APP_URL = process.env.GUARDIAN_APP_URL || "http://localhost:3001";

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
      const result = await sendPush(sub, { title: "긴급 상황", body, url: `${GUARDIAN_APP_URL}/emergency/${event.id}` });
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
