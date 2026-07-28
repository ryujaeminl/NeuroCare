import { prisma } from "@/lib/db/prisma";
import { authErrorResponse, requireSession } from "@/lib/auth/permissions";

/** GET - 이 보호자와 연동된 환자 목록과 각자의 최근 기분 상태 */
export async function GET() {
  try {
    const session = await requireSession();
    if (session.user.role !== "guardian") {
      return Response.json({ error: "보호자 계정만 조회할 수 있습니다." }, { status: 403 });
    }

    const links = await prisma.patientGuardianLink.findMany({
      where: { guardianId: session.user.id },
      select: {
        patient: {
          select: {
            id: true,
            name: true,
            sessions: {
              orderBy: { startedAt: "desc" },
              take: 1,
              select: {
                startedAt: true,
                mood: { select: { mood: true, summary: true } },
              },
            },
          },
        },
      },
    });

    return Response.json({
      patients: links.map(({ patient }) => ({
        id: patient.id,
        name: patient.name,
        lastSession: patient.sessions[0] ?? null,
      })),
    });
  } catch (err) {
    return authErrorResponse(err) ?? Response.json({ error: "조회 실패" }, { status: 500 });
  }
}
