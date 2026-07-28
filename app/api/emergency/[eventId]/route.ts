import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { authErrorResponse, requireGuardianAccess, requirePatientAccess } from "@/lib/auth/permissions";

/** GET /api/emergency/:eventId - 환자 본인 또는 연동된 보호자만 볼 수 있다 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    const { eventId } = await params;
    const event = await prisma.emergencyEvent.findUnique({
      where: { id: eventId },
      include: { patient: { select: { name: true } } },
    });
    if (!event) return Response.json({ error: "이벤트를 찾을 수 없습니다." }, { status: 404 });
    await requirePatientAccess(event.patientId);

    let acknowledgedByName: string | null = null;
    if (event.acknowledgedBy) {
      const acker = await prisma.user.findUnique({ where: { id: event.acknowledgedBy }, select: { name: true } });
      acknowledgedByName = acker?.name ?? null;
    }

    return Response.json({ event: { ...event, acknowledgedByName } });
  } catch (err) {
    return authErrorResponse(err) ?? Response.json({ error: "조회 실패" }, { status: 500 });
  }
}

/** PATCH /api/emergency/:eventId - 보호자가 확인 처리한다. 다른 보호자들에게도 같은 상태가 보인다. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    const { eventId } = await params;
    const existing = await prisma.emergencyEvent.findUnique({ where: { id: eventId } });
    if (!existing) return Response.json({ error: "이벤트를 찾을 수 없습니다." }, { status: 404 });
    const session = await requireGuardianAccess(existing.patientId);

    const body = (await request.json()) as { status?: string };
    if (body.status !== "acknowledged" && body.status !== "resolved") {
      return Response.json({ error: "status는 acknowledged 또는 resolved여야 합니다." }, { status: 400 });
    }

    const event = await prisma.emergencyEvent.update({
      where: { id: eventId },
      data: {
        status: body.status,
        acknowledgedBy: existing.acknowledgedBy ?? session.user.id,
        acknowledgedAt: existing.acknowledgedAt ?? new Date(),
      },
    });
    return Response.json({ event });
  } catch (err) {
    return authErrorResponse(err) ?? Response.json({ error: "처리 실패" }, { status: 400 });
  }
}
