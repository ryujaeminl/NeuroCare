import { NextRequest } from "next/server";
import { checkAndSendMedicationReminders } from "@/lib/guardian/medicationReminderDispatcher";

const CRON_SECRET = process.env.CRON_SECRET;

/**
 * 사람 로그인 세션이 아니라 GPU 서버의 crontab이 주기적으로 부르는 엔드포인트라
 * 공유 비밀키로만 인증한다(server/cron/send-medication-reminders.sh 참고).
 */
export async function POST(request: NextRequest) {
  if (!CRON_SECRET) {
    return Response.json({ error: "CRON_SECRET이 설정되지 않았습니다." }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${CRON_SECRET}`) {
    return Response.json({ error: "인증 실패" }, { status: 401 });
  }

  const result = await checkAndSendMedicationReminders();
  return Response.json(result);
}
