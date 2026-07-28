import { prisma } from "@/lib/db/prisma";
import { authErrorResponse, requirePatientSelf } from "@/lib/auth/permissions";

/** POST - 새 대화 세션 시작. 대화 화면이 마운트될 때 호출한다. */
export async function POST() {
  try {
    const session = await requirePatientSelf();

    const conversation = await prisma.conversationSession.create({
      data: { patientId: session.user.id },
      select: { id: true, startedAt: true },
    });

    return Response.json({ session: conversation }, { status: 201 });
  } catch (err) {
    return authErrorResponse(err) ?? Response.json({ error: "세션 생성 실패" }, { status: 500 });
  }
}
