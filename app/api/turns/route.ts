import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { authErrorResponse, requirePatientSelf } from "@/lib/auth/permissions";
import { upsertMemory } from "@/lib/memory/pineconeClient";
import type { TurnRole } from "@/lib/db/types";

/** POST - 확정된 대화 턴 하나를 저장하고 벡터로도 색인한다. */
export async function POST(request: NextRequest) {
  try {
    const { sessionId, role, text } = (await request.json()) as {
      sessionId?: string;
      role?: TurnRole;
      text?: string;
    };

    if (!sessionId || !role || !text?.trim()) {
      return Response.json({ error: "sessionId, role, text가 필요합니다." }, { status: 400 });
    }

    let conversation = await prisma.conversationSession.findUnique({
      where: { id: sessionId },
      select: { id: true, patientId: true },
    });
    if (!conversation) {
      const firstPatient = await prisma.user.findFirst({ where: { role: "patient" } }).catch(() => null);
      const patientId = firstPatient?.id ?? "patient-default";
      const dateKey = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
      try {
        conversation = await prisma.conversationSession.create({
          data: { id: sessionId, patientId, dateKey },
          select: { id: true, patientId: true },
        });
      } catch {
        const existing = await prisma.conversationSession.findFirst({
          where: { patientId },
          orderBy: { startedAt: "desc" },
          select: { id: true, patientId: true },
        });
        conversation = existing ?? { id: sessionId, patientId };
      }
    }

    const turn = await prisma.turn.create({
      data: { sessionId, role, text: text.trim() },
      select: { id: true, createdAt: true },
    });

    // Pinecone 미설정/실패 시 null이 오며, 그래도 대화 저장 자체는 성공으로 둔다.
    const pineconeId = await upsertMemory({
      turnId: turn.id,
      patientId: conversation.patientId,
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
