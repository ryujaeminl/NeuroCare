import { prisma } from "@/lib/db/prisma";
import { requirePatientSelf } from "@/lib/auth/permissions";

/** GET - 로그인한 환자 본인의 호출어(없으면 null - 기본값 "복실아" 사용) */
export async function GET() {
  try {
    const session = await requirePatientSelf();
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { wakeWord: true },
    });
    return Response.json({ wakeWord: user?.wakeWord ?? null });
  } catch {
    return Response.json({ wakeWord: null });
  }
}
