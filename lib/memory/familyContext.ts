import { prisma } from "@/lib/db/prisma";

/**
 * 보호자가 등록한 가족 관계를 항상 프롬프트에 넣어준다 - 대화 중 나올지 안 나올지 모르는
 * RAG 검색과 달리, 가족 관계는 틀리면 안 되므로 매번 전체를 준다. 인원이 많지 않은
 * 개인용 데이터라 take(30)이면 충분하다.
 */
export async function buildFamilyRoster(patientId: string): Promise<string> {
  const members = await prisma.familyMember.findMany({
    where: { patientId },
    take: 30,
    select: { name: true, relation: true, birthYear: true },
  });
  if (members.length === 0) return "";

  return members
    .map((m) => `- ${m.name} (${m.relation}${m.birthYear ? `, ${m.birthYear}년생` : ""})`)
    .join("\n");
}

/**
 * 아직 AI가 존재를 언급한 적 없는(deliveredAt이 null인) 가족 메시지를 가져오면서, 그
 * 자리에서 바로 delivered로 표시한다("언급할 기회를 가짐" = 전달 완료로 취급) - 그래야
 * 다음 턴/다음 대화에서 똑같은 메시지를 또 언급하라고 반복해서 지시하지 않는다. 실제로
 * 읽어줄지 말지, 언제 물어볼지는 페르소나 프롬프트 지시에 맡긴다(강제로 읽어주지 않음).
 */
export async function takePendingFamilyMessages(
  patientId: string,
): Promise<{ fromName: string; content: string; hasPhoto: boolean }[]> {
  const pending = await prisma.familyMessage.findMany({
    where: { patientId, deliveredAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, fromName: true, content: true, photoUrl: true },
  });
  if (pending.length === 0) return [];

  await prisma.familyMessage.updateMany({
    where: { id: { in: pending.map((m) => m.id) } },
    data: { deliveredAt: new Date() },
  });

  return pending.map(({ fromName, content, photoUrl }) => ({ fromName, content, hasPhoto: Boolean(photoUrl) }));
}

/** 앞으로 14일 안에 있는 가족 일정 - 매번 전체를 주기엔 너무 많아질 수 있어 기간을 제한한다. */
export async function buildUpcomingFamilyPlans(patientId: string): Promise<string> {
  const now = new Date();
  const until = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const plans = await prisma.familyPlan.findMany({
    where: { patientId, date: { gte: now, lte: until } },
    orderBy: { date: "asc" },
    take: 10,
    select: { title: true, date: true, notes: true },
  });
  if (plans.length === 0) return "";

  return plans
    .map((p) => {
      const dateLabel = p.date.toISOString().slice(0, 10);
      return `- ${dateLabel} ${p.title}${p.notes ? ` (${p.notes})` : ""}`;
    })
    .join("\n");
}
