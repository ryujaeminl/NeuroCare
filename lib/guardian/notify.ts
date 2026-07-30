import { prisma } from "@/lib/db/prisma";
import type { NotificationChannel } from "@/lib/db/types";
import { sendEmail } from "@/lib/guardian/resendClient";
import { sendSms } from "@/lib/guardian/twilioClient";
import { sendPush } from "@/lib/guardian/webPush";

export interface NotifyPayload {
  title: string;
  body: string;
  url?: string;
}

/**
 * 보호자가 GuardianPreference에서 고른 채널(push/email/sms/none)로 알림 하나를 보낸다.
 * dispatchMoodAlerts와 복약 알림이 공유한다. emergencyDispatcher는 채널 설정과 무관하게
 * 항상 push+SMS fallback이라(의도적으로 개인 설정을 무시함) 이 함수를 쓰지 않는다.
 */
export async function notifyGuardianByChannel(
  guardianId: string,
  channel: NotificationChannel,
  payload: NotifyPayload,
): Promise<void> {
  if (channel === "none") return;

  if (channel === "push") {
    const subscriptions = await prisma.pushSubscription.findMany({ where: { guardianId } });
    const expiredIds: string[] = [];
    await Promise.all(
      subscriptions.map(async (sub) => {
        const result = await sendPush(sub, payload);
        if (result.expired) expiredIds.push(sub.id);
      }),
    );
    if (expiredIds.length > 0) {
      await prisma.pushSubscription.deleteMany({ where: { id: { in: expiredIds } } });
    }
    return;
  }

  if (channel === "sms") {
    const preference = await prisma.guardianPreference.findUnique({ where: { guardianId } });
    if (preference?.phone) await sendSms(preference.phone, `${payload.title}\n${payload.body}`);
    return;
  }

  const guardian = await prisma.user.findUnique({ where: { id: guardianId }, select: { email: true } });
  if (guardian?.email) await sendEmail(guardian.email, payload.title, payload.body);
}
