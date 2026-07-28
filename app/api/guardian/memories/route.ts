import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { authErrorResponse, requireGuardianAccess, requirePatientAccess } from "@/lib/auth/permissions";
import { parseTags, serializeTags } from "@/lib/db/types";
import { upsertFamilyMemory } from "@/lib/memory/pineconeClient";

interface MemoryInput {
  patientId?: string;
  familyMemberId?: string | null;
  title?: string;
  content?: string;
  dateOccurred?: string | null;
  tags?: string[];
}

/** GET /api/guardian/memories?patientId=...&familyMemberId=... */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const patientId = params.get("patientId") ?? "";
    if (!patientId) return Response.json({ error: "patientId가 필요합니다." }, { status: 400 });
    await requirePatientAccess(patientId);

    const familyMemberId = params.get("familyMemberId");
    const memories = await prisma.memory.findMany({
      where: { patientId, ...(familyMemberId && { familyMemberId }) },
      orderBy: { createdAt: "desc" },
      include: { familyMember: { select: { id: true, name: true, relation: true } } },
    });
    return Response.json({
      memories: memories.map((memory: { tags: string }) => ({ ...memory, tags: parseTags(memory.tags) })),
    });
  } catch (err) {
    return authErrorResponse(err) ?? Response.json({ error: "조회 실패" }, { status: 500 });
  }
}

/**
 * POST /api/guardian/memories - 기억 등록 (보호자만).
 * 저장 직후 Pinecone에도 upsert해서 환자용 앱 대화 중 RAG 검색 대상이 되게 한다.
 * Pinecone 미설정이면 upsertFamilyMemory가 조용히 null을 반환하고 DB 저장은 그대로 성공한다.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as MemoryInput;
    if (!body.patientId || !body.title?.trim() || !body.content?.trim()) {
      return Response.json({ error: "환자, 제목, 내용은 필수입니다." }, { status: 400 });
    }
    const session = await requireGuardianAccess(body.patientId);

    const memory = await prisma.memory.create({
      data: {
        patientId: body.patientId,
        familyMemberId: body.familyMemberId || null,
        title: body.title.trim(),
        content: body.content.trim(),
        dateOccurred: body.dateOccurred ? new Date(body.dateOccurred) : null,
        tags: serializeTags(body.tags ?? []),
        addedBy: session.user.id,
      },
    });

    const pineconeId = await upsertFamilyMemory({
      memoryId: memory.id,
      patientId: memory.patientId,
      title: memory.title,
      content: memory.content,
      createdAt: memory.createdAt,
    });
    if (pineconeId) {
      await prisma.memory.update({ where: { id: memory.id }, data: { pineconeId } });
    }

    return Response.json({ memory: { ...memory, tags: parseTags(memory.tags), pineconeId } }, { status: 201 });
  } catch (err) {
    return authErrorResponse(err) ?? Response.json({ error: "등록 실패" }, { status: 400 });
  }
}
