const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER;

// Twilio REST API는 Basic Auth + form-urlencoded POST만으로 충분해서 SDK 없이 fetch로 호출한다.
const MESSAGES_URL = () => `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;

export function isTwilioConfigured(): boolean {
  return Boolean(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM_NUMBER);
}

/** 실패해도 예외를 던지지 않는다 - 문자 한 통 실패가 다른 보호자에게 가는 알림까지 막으면 안 된다. */
export async function sendSms(to: string, body: string): Promise<boolean> {
  if (!isTwilioConfigured()) return false;

  try {
    const response = await fetch(MESSAGES_URL(), {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: TWILIO_FROM_NUMBER!, Body: body }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
