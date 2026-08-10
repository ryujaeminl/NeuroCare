import { prisma } from "@/lib/db/prisma";
import { requirePatientSelf, authErrorResponse } from "@/lib/auth/permissions";

/**
 * GET - 환자 본인이 회상 중 실제로 언급한 사진 목록("내 추억"). 대화 중 회상 매칭으로
 * 사진이 떠오를 때마다 lib/memory/photoContext.ts가 그 순간의 발화를 Photo.patientQuote에
 * 남겨둔다 - 여기서는 그렇게 쌓인 것 중 최근 것부터 보여준다. 보호자용 데이터가 아니라
 * 환자 자신이 자기 회상을 다시 보는 화면이라 patientId는 세션에서만 가져온다(다른
 * 환자 것을 볼 수 없음 - requirePatientSelf).
 */
export async function GET() {
  try {
    const session = await requirePatientSelf();
    const photos = await prisma.photo.findMany({
      where: { patientId: session.user.id, patientQuote: { not: null } },
      orderBy: { quotedAt: "desc" },
      take: 30,
      select: { id: true, url: true, caption: true, patientQuote: true, quotedAt: true },
    });
    return Response.json({ photos });
  } catch (err) {
    return authErrorResponse(err) ?? Response.json({ error: "불러오지 못했습니다." }, { status: 500 });
  }
}
