const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM || "NeuroKare <onboarding@resend.dev>";

/** twilioClient.ts와 같은 패턴 - API 키가 없으면 이메일은 조용히 비활성화된다. */
export function isResendConfigured(): boolean {
  return Boolean(RESEND_API_KEY);
}

/** 실패해도 예외를 던지지 않는다 - 메일 한 통 실패가 다른 보호자에게 가는 알림까지 막으면 안 된다. */
export async function sendEmail(to: string, subject: string, body: string): Promise<boolean> {
  if (!isResendConfigured()) return false;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: RESEND_FROM, to, subject, text: body }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
