import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { authErrorResponse, requireGuardianAccess, requirePatientAccess } from "@/lib/auth/permissions";

interface FamilyMemberInput {
  patientId?: string;
  name?: string;
  relation?: string;
  birthYear?: number | null;
}

/** GET /api/guardian/family?patientId=... - 가족 구성원 목록 (대표 사진 1장 포함) */
export async function GET(request: NextRequest) {
  try {
    const patientId = request.nextUrl.searchParams.get("patientId") ?? "";
    if (!patientId) return Response.json({ error: "patientId가 필요합니다." }, { status: 400 });
    await requirePatientAccess(patientId);

    const members = await prisma.familyMember.findMany({
      where: { patientId },
      orderBy: { createdAt: "desc" },
      include: {
        photos: { take: 1, orderBy: { createdAt: "desc" }, select: { url: true } },
        _count: { select: { memories: true, photos: true } },
      },
    });
    return Response.json({ members });
  } catch (err) {
    return authErrorResponse(err) ?? Response.json({ error: "조회 실패" }, { status: 500 });
  }
}

/** POST /api/guardian/family - 가족 구성원 등록 (보호자만) */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as FamilyMemberInput;
    if (!body.patientId || !body.name?.trim() || !body.relation?.trim()) {
      return Response.json({ error: "환자, 이름, 관계는 필수입니다." }, { status: 400 });
    }
    const session = await requireGuardianAccess(body.patientId);

    const member = await prisma.familyMember.create({
      data: {
        patientId: body.patientId,
        name: body.name.trim(),
        relation: body.relation.trim(),
        birthYear: body.birthYear ?? null,
        addedBy: session.user.id,
      },
    });
    return Response.json({ member }, { status: 201 });
  } catch (err) {
    return authErrorResponse(err) ?? Response.json({ error: "등록 실패" }, { status: 400 });
  }
}
