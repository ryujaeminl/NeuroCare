import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { authErrorResponse, requireGuardianAccess } from "@/lib/auth/permissions";
import { parseTags, serializeTags } from "@/lib/db/types";
import { deleteFamilyMemory, upsertFamilyMemory } from "@/lib/memory/pineconeClient";

interface MemoryPatch {
  familyMemberId?: string | null;
  title?: string;
  content?: string;
  dateOccurred?: string | null;
  tags?: string[];
}

/** PATCH /api/guardian/memories/:id - 내용이 바뀌면 Pinecone 벡터도 다시 upsert한다 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const existing = await prisma.memory.findUnique({ where: { id } });
    if (!existing) return Response.json({ error: "기억을 찾을 수 없습니다." }, { status: 404 });
    await requireGuardianAccess(existing.patientId);

    const body = (await request.json()) as MemoryPatch;
    const memory = await prisma.memory.update({
      where: { id },
      data: {
        ...(body.familyMemberId !== undefined && { familyMemberId: body.familyMemberId || null }),
        ...(body.title !== undefined && { title: body.title.trim() }),
        ...(body.content !== undefined && { content: body.content.trim() }),
        ...(body.dateOccurred !== undefined && {
          dateOccurred: body.dateOccurred ? new Date(body.dateOccurred) : null,
        }),
        ...(body.tags !== undefined && { tags: serializeTags(body.tags) }),
      },
    });

    if (body.title !== undefined || body.content !== undefined) {
      await upsertFamilyMemory({
        memoryId: memory.id,
        patientId: memory.patientId,
        title: memory.title,
        content: memory.content,
        createdAt: memory.createdAt,
      });
    }

    return Response.json({ memory: { ...memory, tags: parseTags(memory.tags) } });
  } catch (err) {
    return authErrorResponse(err) ?? Response.json({ error: "수정 실패" }, { status: 400 });
  }
}

/** DELETE /api/guardian/memories/:id */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const existing = await prisma.memory.findUnique({ where: { id } });
    if (!existing) return Response.json({ error: "기억을 찾을 수 없습니다." }, { status: 404 });
    await requireGuardianAccess(existing.patientId);

    await prisma.memory.delete({ where: { id } });
    await deleteFamilyMemory(id);
    return Response.json({ deleted: true });
  } catch (err) {
    return authErrorResponse(err) ?? Response.json({ error: "삭제 실패" }, { status: 500 });
  }
}
