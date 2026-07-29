import { prisma } from "@/lib/db/prisma";
import { authErrorResponse, requirePatientSelf } from "@/lib/auth/permissions";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 지금 이 순간이 속한 한국 시간 기준 하루의 [시작, 끝) 구간을 UTC Date로 돌려준다. */
function todayRangeKst(): { start: Date; end: Date } {
  const kstNow = new Date(Date.now() + KST_OFFSET_MS);
  const kstMidnightUtc = Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate());
  const start = new Date(kstMidnightUtc - KST_OFFSET_MS);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/**
 * POST - 오늘 대화 세션을 가져오거나 없으면 새로 만든다. 대화 화면이 마운트될 때마다
 * 호출되는데, 매번 새 세션을 만들면 하루에 앱을 여러 번 열 때마다 기록/기분 요약이
 * 조각조각 나뉜다 - 보호자는 "하루치 요약"을 원하므로 같은 날짜면 세션을 이어 쓴다.
 */
export async function POST() {
  try {
    const session = await requirePatientSelf();
    const { start, end } = todayRangeKst();

    const existing = await prisma.conversationSession.findFirst({
      where: { patientId: session.user.id, startedAt: { gte: start, lt: end } },
      orderBy: { startedAt: "desc" },
      select: { id: true, startedAt: true },
    });
    if (existing) {
      return Response.json({ session: existing });
    }

    const conversation = await prisma.conversationSession.create({
      data: { patientId: session.user.id },
      select: { id: true, startedAt: true },
    });

    return Response.json({ session: conversation }, { status: 201 });
  } catch (err) {
    return authErrorResponse(err) ?? Response.json({ error: "세션 생성 실패" }, { status: 500 });
  }
}
