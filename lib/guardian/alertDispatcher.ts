import { prisma } from "@/lib/db/prisma";
import { meetsAlertThreshold, type AlertThreshold, type Mood, type NotificationChannel } from "@/lib/db/types";
import { notifyGuardianByChannel } from "@/lib/guardian/notify";

// 보호자 앱(neurocare-guardian, ../Neurocaremam)은 별도 오리진에서 뜬다 - 알림 클릭 시
// 그 앱의 URL을 절대경로로 열어야 한다. 아직 그 앱이 배포된 곳이 없어 이 값을 Vercel
// 프로덕션에 설정하지 않았다 - 설정 전까지는 기존처럼 이 앱 안의 상대경로로 그대로
// 동작해야 한다("http://localhost:3001"로 하드코딩하면 실사용자 알림이 전부 깨진다).
const GUARDIAN_APP_URL = process.env.GUARDIAN_APP_URL;

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

  const payload = { title: `${patientName}님의 기분 알림`, body: summary, url: GUARDIAN_APP_URL || "/guardian" };

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
