import { prisma } from "@/lib/db/prisma";

/**
 * 최근 재생한 곡 제목 15개를 시간 역순으로 가져와 instructions에 끼워 넣을
 * 블록 문자열로 만든다. 가수/장르는 뽑지 않는다 - 원문 제목 그대로 넘기고
 * 모델이 텍스트에서 직접 취향을 추론하게 한다(스펙 근거). 재생 이력이 없으면
 * 빈 문자열(호출부가 truthy 체크로 건너뜀 - buildRecentCalendarEvents와 동일
 * 패턴).
 */
export async function buildRecentPlaysContext(patientId: string): Promise<string> {
  const plays = await prisma.playedSong.findMany({
    where: { patientId },
    orderBy: { playedAt: "desc" },
    take: 15,
    select: { title: true },
  });
  if (plays.length === 0) return "";

  return plays.map((p) => `- ${p.title}`).join("\n");
}
