import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { authErrorResponse, requireGuardianAccess, requirePatientAccess } from "@/lib/auth/permissions";
import { parseTags } from "@/lib/db/types";

interface FamilyMemberPatch {
  name?: string;
  relation?: string;
  birthYear?: number | null;
}

/** GET /api/guardian/family/:memberId - 구성원 상세 (관련 기억/사진 전체) */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ memberId: string }> }) {
  try {
    const { memberId } = await params;
    const member = await prisma.familyMember.findUnique({
      where: { id: memberId },
      include: {
        memories: { orderBy: { createdAt: "desc" } },
        photos: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!member) return Response.json({ error: "구성원을 찾을 수 없습니다." }, { status: 404 });
    await requirePatientAccess(member.patientId);

    return Response.json({
      member: {
        ...member,
        memories: member.memories.map((memory: { tags: string }) => ({ ...memory, tags: parseTags(memory.tags) })),
      },
    });
  } catch (err) {
    return authErrorResponse(err) ?? Response.json({ error: "조회 실패" }, { status: 500 });
  }
}

/** PATCH /api/guardian/family/:memberId (보호자만) */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ memberId: string }> }) {
  try {
    const { memberId } = await params;
    const existing = await prisma.familyMember.findUnique({ where: { id: memberId } });
    if (!existing) return Response.json({ error: "구성원을 찾을 수 없습니다." }, { status: 404 });
    await requireGuardianAccess(existing.patientId);

    const body = (await request.json()) as FamilyMemberPatch;
    const member = await prisma.familyMember.update({
      where: { id: memberId },
      data: {
        ...(body.name !== undefined && { name: body.name.trim() }),
        ...(body.relation !== undefined && { relation: body.relation.trim() }),
        ...(body.birthYear !== undefined && { birthYear: body.birthYear }),
      },
    });
    return Response.json({ member });
  } catch (err) {
    return authErrorResponse(err) ?? Response.json({ error: "수정 실패" }, { status: 400 });
  }
}

/** DELETE /api/guardian/family/:memberId (보호자만) - 연결된 기억/사진은 남고 인물 연결만 끊긴다 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ memberId: string }> }) {
  try {
    const { memberId } = await params;
    const existing = await prisma.familyMember.findUnique({ where: { id: memberId } });
    if (!existing) return Response.json({ error: "구성원을 찾을 수 없습니다." }, { status: 404 });
    await requireGuardianAccess(existing.patientId);

    await prisma.familyMember.delete({ where: { id: memberId } });
    return Response.json({ deleted: true });
  } catch (err) {
    return authErrorResponse(err) ?? Response.json({ error: "삭제 실패" }, { status: 500 });
  }
}
