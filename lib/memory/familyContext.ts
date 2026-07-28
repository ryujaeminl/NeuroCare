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
