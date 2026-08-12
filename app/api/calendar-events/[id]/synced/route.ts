import { NextRequest } from "next/server";
import { auth } from "@/lib/auth/authOptions";
import { prisma } from "@/lib/db/prisma";

/** POST /api/calendar-events/:id/synced - 네이티브 캘린더 삽입 완료 표시 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "patient") {
    return Response.json({ error: "환자 계정만 가능합니다." }, { status: 403 });
  }

  const { id } = await params;
  const event = await prisma.calendarEvent.findUnique({ where: { id } });
  if (!event || event.patientId !== session.user.id) {
    return Response.json({ error: "일정을 찾을 수 없습니다." }, { status: 404 });
  }

  await prisma.calendarEvent.update({ where: { id }, data: { syncedToDeviceAt: new Date() } });
  return Response.json({ ok: true });
}
