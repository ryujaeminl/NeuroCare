import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import {
  authErrorResponse,
  requirePatientAccess,
  requireSession,
} from "@/lib/auth/permissions";
import { parseNotableMoments } from "@/lib/db/types";

/**
 * GET /api/history?patientId=...&sessionId=...&q=...
 * - sessionId 있으면 해당 세션의 전체 스크립트
 * - q 있으면 원문 키워드 검색
 * - 둘 다 없으면 날짜별 세션 목록
 */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const session = await requireSession();

    // patientId를 안 주면 환자 본인 기록으로 본다(환자 화면은 단순해야 하므로).
    const patientId = params.get("patientId") ?? session.user.linkedPatientIds[0] ?? "";
    if (!patientId) {
      return Response.json({ error: "조회할 환자가 없습니다." }, { status: 404 });
    }
    await requirePatientAccess(patientId);

    const sessionId = params.get("sessionId");
    if (sessionId) {
      const detail = await prisma.conversationSession.findFirst({
        where: { id: sessionId, patientId },
        include: {
          turns: { orderBy: { createdAt: "asc" } },
          mood: true,
        },
      });
      if (!detail) {
        return Response.json({ error: "세션을 찾을 수 없습니다." }, { status: 404 });
      }
      return Response.json({
        session: {
          id: detail.id,
          startedAt: detail.startedAt,
          endedAt: detail.endedAt,
          turns: detail.turns.map((turn) => ({
            id: turn.id,
            role: turn.role,
            text: turn.text,
            createdAt: turn.createdAt,
          })),
          mood: detail.mood
            ? {
                mood: detail.mood.mood,
                confidence: detail.mood.confidence,
                summary: detail.mood.summary,
                notableMoments: parseNotableMoments(detail.mood.notableMoments),
              }
            : null,
        },
      });
    }

    const query = params.get("q")?.trim();
    if (query) {
      const turns = await prisma.turn.findMany({
        where: { session: { patientId }, text: { contains: query } },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { id: true, role: true, text: true, createdAt: true, sessionId: true },
      });
      return Response.json({ results: turns });
    }

    const sessions = await prisma.conversationSession.findMany({
      where: { patientId },
      orderBy: { startedAt: "desc" },
      take: 60,
      include: {
        mood: { select: { mood: true, confidence: true, summary: true } },
        _count: { select: { turns: true } },
      },
    });

    return Response.json({
      sessions: sessions.map((item) => ({
        id: item.id,
        startedAt: item.startedAt,
        endedAt: item.endedAt,
        turnCount: item._count.turns,
        mood: item.mood,
      })),
    });
  } catch (err) {
    return authErrorResponse(err) ?? Response.json({ error: "기록 조회 실패" }, { status: 500 });
  }
}
