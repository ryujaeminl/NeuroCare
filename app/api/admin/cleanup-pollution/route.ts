import { prisma } from "@/lib/db/prisma";
import { deleteMemories } from "@/lib/memory/pineconeClient";

/**
 * 일회성 정리용 임시 엔드포인트. "복실아"를 사용자 이름으로 오인해 저장된 오염된
 * 대화 턴(DB + Pinecone 벡터)을 지운다. 이 앱은 환자 1명이 쓰는 개인 테스트
 * 배포라 인증 없이 전체 대상으로 돈다 - 정리가 끝나면 이 파일 자체를 삭제한다.
 */
export async function POST(request: Request) {
  const secret = request.headers.get("x-cleanup-secret");
  if (secret !== "neurocare-cleanup-2026") {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const polluted = await prisma.turn.findMany({
    where: { text: { contains: "복실" } },
    select: { id: true, role: true, text: true, createdAt: true },
  });

  if (polluted.length > 0) {
    await prisma.turn.deleteMany({ where: { id: { in: polluted.map((t) => t.id) } } });
    await deleteMemories(polluted.map((t) => t.id));
  }

  return Response.json({
    deletedCount: polluted.length,
    deleted: polluted.map((t) => ({ role: t.role, text: t.text, createdAt: t.createdAt })),
  });
}
