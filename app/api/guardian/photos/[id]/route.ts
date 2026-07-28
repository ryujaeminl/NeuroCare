import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { authErrorResponse, requireGuardianAccess } from "@/lib/auth/permissions";
import { deletePhoto } from "@/lib/guardian/storageClient";

/** DELETE /api/guardian/photos/:id (보호자만) */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const existing = await prisma.photo.findUnique({ where: { id } });
    if (!existing) return Response.json({ error: "사진을 찾을 수 없습니다." }, { status: 404 });
    await requireGuardianAccess(existing.patientId);

    await prisma.photo.delete({ where: { id } });
    await deletePhoto(existing.url);
    return Response.json({ deleted: true });
  } catch (err) {
    return authErrorResponse(err) ?? Response.json({ error: "삭제 실패" }, { status: 500 });
  }
}
