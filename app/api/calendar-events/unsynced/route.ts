import { auth } from "@/lib/auth/authOptions";
import { prisma } from "@/lib/db/prisma";

/**
 * GET /api/calendar-events/unsynced - 로그인한 환자 본인의, 아직 네이티브 캘린더에
 * 안 반영된 일정. MainActivity.kt가 앱 재개 시/일정 확인 직후 호출해 각각 네이티브
 * 삽입한 뒤 /synced로 완료 표시한다.
 */
export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "patient") {
    return Response.json({ error: "환자 계정만 조회할 수 있습니다." }, { status: 403 });
  }

  const events = await prisma.calendarEvent.findMany({
    where: { patientId: session.user.id, syncedToDeviceAt: null },
    select: { id: true, title: true, date: true },
    orderBy: { date: "asc" },
  });
  // date를 "YYYY-MM-DD"로 명시적으로 잘라서 보낸다 - Prisma Date를 그대로 JSON
  // 직렬화하면 전체 ISO 문자열(2026-08-15T00:00:00.000Z)이 되는데, 네이티브 쪽
  // (MainActivity.kt)이 SimpleDateFormat("yyyy-MM-dd")로 파싱하므로 형식을 맞춰야 한다.
  return Response.json({
    events: events.map((e) => ({ id: e.id, title: e.title, date: e.date.toISOString().slice(0, 10) })),
  });
}
