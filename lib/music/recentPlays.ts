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
    take: 30,
    select: { title: true, playedAt: true },
  });
  if (plays.length === 0) return "";

  const counts = new Map<string, number>();
  for (const play of plays) counts.set(play.title, (counts.get(play.title) ?? 0) + 1);
  const favorites = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([title, count]) => `- ${title}${count > 1 ? ` (${count}회)` : ""}`)
    .join("\n");
  const recent = plays
    .slice(0, 8)
    .map((play) => `- ${play.title} (${play.playedAt.toISOString().slice(0, 10)})`)
    .join("\n");

  return `[반복해서 들은 곡]\n${favorites}\n\n[최근 들은 곡]\n${recent}`;
}
