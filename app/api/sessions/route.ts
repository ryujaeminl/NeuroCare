import { prisma } from "@/lib/db/prisma";
import { authErrorResponse, requirePatientSelf } from "@/lib/auth/permissions";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 지금 이 순간의 한국 시간 기준 날짜 키("YYYY-MM-DD")를 돌려준다. */
function todayKeyKst(): string {
  return new Date(Date.now() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * POST - 오늘 대화 세션을 가져오거나 없으면 새로 만든다. 대화 화면이 마운트될 때마다
 * 호출되는데, 매번 새 세션을 만들면 하루에 앱을 여러 번 열 때마다 기록/기분 요약이
 * 조각조각 나뉜다 - 보호자는 "하루치 요약"을 원하므로 같은 날짜면 세션을 이어 쓴다.
 *
 * "오늘 세션 있으면 재사용, 없으면 생성"을 findFirst 후 create로 나눠서 하면, 웨이크워드로
 * 앱이 짧은 간격에 여러 번 열릴 때 두 요청이 동시에 "없음"을 보고 각자 세션을 만드는 경쟁이
 * 생긴다(실사용에서 확인: 하루에 세션이 여러 개로 쪼개짐). upsert는 (patientId, dateKey)
 * 유니크 제약에 기대어 DB가 이 경쟁을 원자적으로 해결하게 한다.
 */
export async function POST() {
  try {
    const session = await requirePatientSelf();
    const dateKey = todayKeyKst();

    const conversation = await prisma.conversationSession.upsert({
      where: { patientId_dateKey: { patientId: session.user.id, dateKey } },
      update: {},
      create: { patientId: session.user.id, dateKey },
      select: { id: true, startedAt: true },
    });

    return Response.json({ session: conversation });
  } catch (err) {
    return authErrorResponse(err) ?? Response.json({ error: "세션 생성 실패" }, { status: 500 });
  }
}
