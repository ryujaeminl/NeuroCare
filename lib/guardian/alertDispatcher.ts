import { prisma } from "@/lib/db/prisma";
import { meetsAlertThreshold, type AlertThreshold, type Mood } from "@/lib/db/types";
import { sendPush } from "@/lib/guardian/webPush";

/**
 * 기분 분석이 끝날 때마다 호출된다. 긴급 알림(emergencyDispatcher)과 달리 보호자마다
 * GuardianPreference를 따로 확인해서, 같은 환자를 보는 보호자끼리도 독립적으로 판단한다.
 * ponytail: notificationChannel이 "email"/"sms"인 보호자는 아직 실제 발송을 구현하지
 * 않았다 - 채널별 발송기를 추가할 때 여기서 분기하면 된다.
 */
export async function dispatchMoodAlerts(patientId: string, patientName: string, mood: Mood, summary: string): Promise<void> {
  const links = await prisma.patientGuardianLink.findMany({
    where: { patientId },
    select: { guardianId: true },
  });
  if (links.length === 0) return;

  const guardianIds = links.map((l) => l.guardianId);
  const preferences = await prisma.guardianPreference.findMany({
    where: { guardianId: { in: guardianIds } },
  });
  const prefByGuardian = new Map(preferences.map((p) => [p.guardianId, p]));

  const targets = guardianIds.filter((guardianId) => {
    const pref = prefByGuardian.get(guardianId);
    // 설정을 아직 저장한 적 없는 보호자는 기본값(moodAlertEnabled: true, moderate)을 따른다.
    const enabled = pref?.moodAlertEnabled ?? true;
    const threshold = (pref?.moodAlertThreshold ?? "moderate") as AlertThreshold;
    const channel = pref?.notificationChannel ?? "push";
    return enabled && channel === "push" && meetsAlertThreshold(mood, threshold);
  });
  if (targets.length === 0) return;

  const subscriptions = await prisma.pushSubscription.findMany({ where: { guardianId: { in: targets } } });
  const expiredIds: string[] = [];

  await Promise.all(
    subscriptions.map(async (sub) => {
      const result = await sendPush(sub, {
        title: `${patientName}님의 기분 알림`,
        body: summary,
        url: "/guardian",
      });
      if (result.expired) expiredIds.push(sub.id);
    }),
  );

  if (expiredIds.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: expiredIds } } });
  }
}
