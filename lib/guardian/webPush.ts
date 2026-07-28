import webpush from "web-push";

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@example.com";

export interface PushSubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Pinecone/Clova와 같은 패턴 - VAPID 키가 없으면 푸시는 조용히 비활성화된다. */
export function isPushConfigured(): boolean {
  return Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
}

let configured = false;
function ensureConfigured() {
  if (configured || !isPushConfigured()) return;
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY!, VAPID_PRIVATE_KEY!);
  configured = true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

/**
 * 실패해도 예외를 던지지 않는다 - 구독 하나가 만료됐다고 다른 보호자에게 가는 알림까지
 * 막히면 안 된다. 만료된 구독(410 Gone)인지 여부만 반환해서 호출부가 DB에서 지울 수 있게 한다.
 */
export async function sendPush(
  subscription: PushSubscriptionInput,
  payload: PushPayload,
): Promise<{ sent: boolean; expired: boolean }> {
  if (!isPushConfigured()) return { sent: false, expired: false };
  ensureConfigured();

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload),
    );
    return { sent: true, expired: false };
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    return { sent: false, expired: statusCode === 404 || statusCode === 410 };
  }
}
