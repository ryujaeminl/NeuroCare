import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { authErrorResponse, requireGuardianAccess } from "@/lib/auth/permissions";

interface TaskPatch {
  title?: string;
  dueDate?: string | null;
  completed?: boolean;
}

/** PATCH /api/guardian/tasks/:id - 완료 체크/제목/기한 수정 (보호자만) */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const existing = await prisma.familyTask.findUnique({ where: { id } });
    if (!existing) return Response.json({ error: "할 일을 찾을 수 없습니다." }, { status: 404 });
    await requireGuardianAccess(existing.patientId);

    const body = (await request.json()) as TaskPatch;
    const task = await prisma.familyTask.update({
      where: { id },
      data: {
        ...(body.title !== undefined && { title: body.title.trim() }),
        ...(body.dueDate !== undefined && { dueDate: body.dueDate ? new Date(body.dueDate) : null }),
        ...(body.completed !== undefined && { completed: body.completed }),
      },
    });
    return Response.json({ task });
  } catch (err) {
    const authResponse = authErrorResponse(err);
    if (authResponse) return authResponse;
    return Response.json({ error: "수정 실패" }, { status: 400 });
  }
}

/** DELETE /api/guardian/tasks/:id (보호자만) */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const existing = await prisma.familyTask.findUnique({ where: { id } });
    if (!existing) return Response.json({ error: "할 일을 찾을 수 없습니다." }, { status: 404 });
    await requireGuardianAccess(existing.patientId);

    await prisma.familyTask.delete({ where: { id } });
    return Response.json({ deleted: true });
  } catch (err) {
    return authErrorResponse(err) ?? Response.json({ error: "삭제 실패" }, { status: 500 });
  }
}
