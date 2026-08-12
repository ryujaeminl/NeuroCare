import { prisma } from "@/lib/db/prisma";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** app/api/sessions/route.ts의 todayKeyKst()와 동일 로직 - KST 기준 "YYYY-MM-DD". */
function todayKeyKst(): string {
  return new Date(Date.now() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

const ROLE_LABEL: Record<string, string> = { user: "환자", assistant: "AI" };

/**
 * 오늘(KST) 아닌 가장 최근 대화 세션의 마지막 10개 턴을 시간순으로 가져와
 * Realtime instructions에 끼워 넣을 블록 문자열로 만든다. 세션이 없거나 턴이
 * 0개면 빈 문자열(호출부가 truthy 체크로 건너뜀 - buildRecentCalendarEvents와
 * 동일 패턴).
 */
export async function buildPreviousSessionContext(patientId: string): Promise<string> {
  const session = await prisma.conversationSession.findFirst({
    where: { patientId, dateKey: { not: todayKeyKst() } },
    orderBy: { startedAt: "desc" },
    select: { id: true },
  });
  if (!session) return "";

  const turns = await prisma.turn.findMany({
    where: { sessionId: session.id },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { role: true, text: true },
  });
  if (turns.length === 0) return "";

  return turns
    .reverse()
    .map((t) => `${ROLE_LABEL[t.role] ?? t.role}: ${t.text}`)
    .join("\n");
}
