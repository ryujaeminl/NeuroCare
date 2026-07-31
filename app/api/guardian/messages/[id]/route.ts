import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { authErrorResponse, requireGuardianAccess } from "@/lib/auth/permissions";

/** DELETE /api/guardian/messages/:id (보호자만) */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const existing = await prisma.familyMessage.findUnique({ where: { id } });
    if (!existing) return Response.json({ error: "메시지를 찾을 수 없습니다." }, { status: 404 });
    await requireGuardianAccess(existing.patientId);

    await prisma.familyMessage.delete({ where: { id } });
    return Response.json({ deleted: true });
  } catch (err) {
    return authErrorResponse(err) ?? Response.json({ error: "삭제 실패" }, { status: 500 });
  }
}
