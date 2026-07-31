import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { authErrorResponse, requireGuardianAccess } from "@/lib/auth/permissions";

interface PlanPatch {
  title?: string;
  date?: string;
  notes?: string | null;
}

/** PATCH /api/guardian/plans/:id - 일정 수정 (보호자만) */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const existing = await prisma.familyPlan.findUnique({ where: { id } });
    if (!existing) return Response.json({ error: "일정을 찾을 수 없습니다." }, { status: 404 });
    await requireGuardianAccess(existing.patientId);

    const body = (await request.json()) as PlanPatch;
    const plan = await prisma.familyPlan.update({
      where: { id },
      data: {
        ...(body.title !== undefined && { title: body.title.trim() }),
        ...(body.date !== undefined && { date: new Date(body.date) }),
        ...(body.notes !== undefined && { notes: body.notes?.trim() || null }),
      },
    });
    return Response.json({ plan });
  } catch (err) {
    const authResponse = authErrorResponse(err);
    if (authResponse) return authResponse;
    return Response.json({ error: "수정 실패" }, { status: 400 });
  }
}

/** DELETE /api/guardian/plans/:id (보호자만) */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const existing = await prisma.familyPlan.findUnique({ where: { id } });
    if (!existing) return Response.json({ error: "일정을 찾을 수 없습니다." }, { status: 404 });
    await requireGuardianAccess(existing.patientId);

    await prisma.familyPlan.delete({ where: { id } });
    return Response.json({ deleted: true });
  } catch (err) {
    return authErrorResponse(err) ?? Response.json({ error: "삭제 실패" }, { status: 500 });
  }
}
