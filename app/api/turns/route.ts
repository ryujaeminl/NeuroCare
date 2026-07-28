import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { authErrorResponse, requirePatientSelf } from "@/lib/auth/permissions";
import { upsertMemory } from "@/lib/memory/pineconeClient";
import type { TurnRole } from "@/lib/db/types";

/** POST - 확정된 대화 턴 하나를 저장하고 벡터로도 색인한다. */
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePatientSelf();
    const { sessionId, role, text } = (await request.json()) as {
      sessionId?: string;
      role?: TurnRole;
      text?: string;
    };

    if (!sessionId || !role || !text?.trim()) {
      return Response.json({ error: "sessionId, role, text가 필요합니다." }, { status: 400 });
    }

    // 남의 세션에 턴을 끼워 넣지 못하게 소유권을 확인한다.
    const conversation = await prisma.conversationSession.findUnique({
      where: { id: sessionId },
      select: { patientId: true },
    });
    if (!conversation || conversation.patientId !== auth.user.id) {
      return Response.json({ error: "세션을 찾을 수 없습니다." }, { status: 404 });
    }

    const turn = await prisma.turn.create({
      data: { sessionId, role, text: text.trim() },
      select: { id: true, createdAt: true },
    });

    // Pinecone 미설정/실패 시 null이 오며, 그래도 대화 저장 자체는 성공으로 둔다.
    const pineconeId = await upsertMemory({
      turnId: turn.id,
      patientId: auth.user.id,
      sessionId,
      role,
      text: text.trim(),
      createdAt: turn.createdAt,
    });

    if (pineconeId) {
      await prisma.turn.update({ where: { id: turn.id }, data: { pineconeId } });
    }

    return Response.json({ turn: { id: turn.id, indexed: Boolean(pineconeId) } }, { status: 201 });
  } catch (err) {
    return authErrorResponse(err) ?? Response.json({ error: "턴 저장 실패" }, { status: 500 });
  }
}
