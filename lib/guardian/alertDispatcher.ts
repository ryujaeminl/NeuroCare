import { prisma } from "@/lib/db/prisma";
import { meetsAlertThreshold, type AlertThreshold, type Mood, type NotificationChannel } from "@/lib/db/types";
import { notifyGuardianByChannel } from "@/lib/guardian/notify";

/**
 * 기분 분석이 끝날 때마다 호출된다. 긴급 알림(emergencyDispatcher)과 달리 보호자마다
 * GuardianPreference를 따로 확인해서, 같은 환자를 보는 보호자끼리도 독립적으로 판단한다.
 * notificationChannel이 "email"/"sms"인 보호자에게도 notifyGuardianByChannel을 통해
 * 실제로 발송된다.
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

  const payload = { title: `${patientName}님의 기분 알림`, body: summary, url: "/guardian" };

  await Promise.all(
    guardianIds.map((guardianId) => {
      const pref = prefByGuardian.get(guardianId);
      // 설정을 아직 저장한 적 없는 보호자는 기본값(moodAlertEnabled: true, moderate, push)을 따른다.
      const enabled = pref?.moodAlertEnabled ?? true;
      const threshold = (pref?.moodAlertThreshold ?? "moderate") as AlertThreshold;
      const channel = (pref?.notificationChannel ?? "push") as NotificationChannel;
      if (!enabled || !meetsAlertThreshold(mood, threshold)) return Promise.resolve();
      return notifyGuardianByChannel(guardianId, channel, payload);
    }),
  );
}
