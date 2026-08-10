import { prisma } from "@/lib/db/prisma";
import type { Photo } from "@prisma/client";

/** "보여드릴까요?"에 대한 환자의 대답을 아주 단순하게 판별한다 - END_CONVERSATION_PATTERN과
 * 같은 스타일로, 짧고 직접적인 대답만 본다(복잡한 자연어 이해 대신 흔한 응답 패턴만 커버). */
const NEGATIVE_REPLY = /^(아니|아니요|아뇨|괜찮아|됐어|싫어|나중에)/;
const AFFIRMATIVE_REPLY = /^(네|넹|예|응|어|그래|좋아|보여줘|보여주세요|보고싶어|궁금해)/;

export function isAffirmativeReply(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || NEGATIVE_REPLY.test(trimmed)) return false;
  return AFFIRMATIVE_REPLY.test(trimmed);
}

/**
 * 아직 AI가 존재를 언급한 적 없는(offeredAt이 null인) 사진이 있으면, 그 자리에서
 * offeredAt을 채우고(FamilyMessage와 같은 "한 번만 물어본다" 패턴) 시스템 프롬프트에
 * 덧붙일 안내문을 돌려준다. 실제로 보여줄지는 pickPhotoToShow가 다음 턴에 판단한다.
 */
export async function getUnofferedPhotoPrompt(patientId: string): Promise<string> {
  const unoffered = await prisma.photo.findMany({
    where: { patientId, offeredAt: null },
    orderBy: { createdAt: "asc" },
    take: 1,
  });
  if (unoffered.length === 0) return "";

  await prisma.photo.updateMany({
    where: { id: { in: unoffered.map((p) => p.id) } },
    data: { offeredAt: new Date() },
  });

  return `

[아직 안 보여드린 새 사진]
가족이 사진을 올렸습니다. 대화 흐름에 자연스러운 시점에 딱 한 번 "새로 온 사진이
있어요, 보여드릴까요?"처럼 물어보세요. 환자가 원한다고 하면(이미 시스템이 화면에
띄워줄 것이니) "네, 여기 있어요" 정도로만 자연스럽게 반응하세요 - 사진 내용을
직접 묘사하려 하지 마세요(아직 무슨 사진인지 알 수 없습니다). 원치 않으면 억지로
보여주지 마세요.`;
}

/**
 * 이번 턴에 화면에 띄울 사진 하나를 고른다. 우선순위:
 * 1) 이미 "보여드릴까요?"라고 물어봤고(offeredAt 있음) 아직 안 보여줬는데(shownAt 없음)
 *    환자가 방금 그렇다고 답한 경우 - 그 사진을 shownAt으로 표시하고 반환.
 * 2) 지금 대화가 언급한 옛 기억(matchedMemoryIds, Pinecone RAG로 찾은 것)에 연결된
 *    사진이 있는 경우 - 회상 중 자연스럽게 곁들여 보여준다(동의 절차 불필요, 이미
 *    나누고 있는 이야기를 시각적으로 보강하는 것뿐이라 새 정보를 들이미는 게 아님).
 */
export async function pickPhotoToShow(
  patientId: string,
  latestUserText: string,
  matchedMemoryIds: string[],
): Promise<Photo | null> {
  const offered = await prisma.photo.findFirst({
    where: { patientId, offeredAt: { not: null }, shownAt: null },
    orderBy: { offeredAt: "asc" },
  });
  if (offered && isAffirmativeReply(latestUserText)) {
    return prisma.photo.update({ where: { id: offered.id }, data: { shownAt: new Date() } });
  }

  if (matchedMemoryIds.length > 0) {
    const memoryPhoto = await prisma.photo.findFirst({
      where: { patientId, memoryId: { in: matchedMemoryIds } },
      orderBy: { createdAt: "desc" },
    });
    if (memoryPhoto) return memoryPhoto;
  }

  return null;
}
