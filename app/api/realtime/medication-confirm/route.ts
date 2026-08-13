import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/authOptions";
import { prisma } from "@/lib/db/prisma";
import { resolveConfirmationDateKey } from "@/lib/medication/dueMedicationContext";

/**
 * POST /api/realtime/medication-confirm - Realtime 세션 중 모델이 confirm_medication
 * tool을 호출하면(app/api/realtime/token/route.ts의 [복용 예정 약] 지시에 따라 환자가
 * "먹었어요"라고 답했을 때만) 클라이언트가 이 라우트를 부른다. add_calendar_event와
 * 같은 이유로 별도 확인 절차 없이 tool 호출 자체를 확인 완료로 간주한다.
 * 홈 화면의 "확인했습니다" 버튼(app/page.tsx)도 같은 라우트를 재사용한다.
 * dateKey는 클라이언트가 넘기지 않는다 - 모델/버튼 양쪽 다 몰라도 되게 서버가
 * reminderTime과 지금 시각으로 스스로 계산한다(resolveConfirmationDateKey).
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "patient") {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }
  const patientId = session.user.id;

  const body = (await request.json().catch(() => null)) as { medicationId?: string; reminderTime?: string } | null;
  const medicationId = body?.medicationId?.trim();
  const reminderTime = body?.reminderTime?.trim();
  if (!medicationId || !reminderTime) {
    return NextResponse.json({ error: "medicationId, reminderTime이 필요합니다." }, { status: 400 });
  }
  const dateKey = resolveConfirmationDateKey(reminderTime, new Date());

  // 이 환자 소유의 약인지 확인 - id를 알아도 남의 약을 확인 처리할 수 없어야 한다.
  const medication = await prisma.medication.findUnique({ where: { id: medicationId }, select: { patientId: true } });
  if (!medication || medication.patientId !== patientId) {
    return NextResponse.json({ error: "해당 약을 찾을 수 없습니다." }, { status: 404 });
  }

  try {
    await prisma.medicationConfirmation.create({ data: { medicationId, reminderTime, dateKey } });
  } catch {
    // 유니크 제약 위반 = 이미 확인 처리됨. 재확인 요청은 그냥 성공으로 취급한다
    // (음성으로 한 번 더 "먹었어요"라고 말해도 오류를 낼 이유가 없다).
  }

  return NextResponse.json({ ok: true });
}
