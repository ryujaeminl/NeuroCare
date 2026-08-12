import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/authOptions";
import { prisma } from "@/lib/db/prisma";

/**
 * POST /api/realtime/calendar-event - Realtime 세션 중 모델이 add_calendar_event
 * tool을 호출하면 클라이언트가 이 라우트를 부른다. 텍스트챗의 handleCalendarTurn()과
 * 달리 별도 확인 절차가 없다 - 모델이 이미 대화로 사용자 동의를 확인한 뒤에만 tool을
 * 호출하도록 지시받으므로(app/api/realtime/token/route.ts의 instructions 참고),
 * tool 호출 자체를 확인 완료로 간주하고 바로 저장한다.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "patient") {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { title?: string; date?: string } | null;
  const title = body?.title?.trim();
  const date = body?.date ? new Date(body.date) : null;
  if (!title || !date || Number.isNaN(date.getTime())) {
    return NextResponse.json({ error: "title과 유효한 date가 필요합니다." }, { status: 400 });
  }

  try {
    await prisma.calendarEvent.create({
      data: { patientId: session.user.id, title, date, source: "patient_voice" },
    });
  } catch {
    return NextResponse.json({ error: "일정 저장에 실패했습니다." }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
