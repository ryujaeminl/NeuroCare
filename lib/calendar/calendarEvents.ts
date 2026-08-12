import { prisma } from "@/lib/db/prisma";
import { isAffirmativeReply } from "@/lib/memory/photoContext";
import { detectCalendarIntent } from "@/lib/calendar/detectCalendarIntent";

function formatDateLabel(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * 매 턴 항상 호출한다(chat/route.ts). 대기 중인 제안이 있으면 이번 발화가 확인인지
 * 판단하고, 없으면 이번 발화에서 새로 일정 의도를 찾는다. 프롬프트에 끼워 넣을
 * 블록 문자열과, "방금 확인돼서 저장까지 끝났는가"(응답 헤더로 클라이언트에 동기화
 * 트리거를 알려줄지 chat/route.ts가 판단하는 데 씀)를 함께 돌려준다.
 */
export async function handleCalendarTurn(
  patientId: string,
  latestUserText: string,
): Promise<{ promptBlock: string; justConfirmed: boolean }> {
  const pending = await prisma.pendingCalendarProposal.findUnique({ where: { patientId } });

  if (pending) {
    if (isAffirmativeReply(latestUserText)) {
      await prisma.$transaction([
        prisma.calendarEvent.create({
          data: {
            patientId,
            title: pending.title,
            date: pending.date,
            source: "patient_voice",
          },
        }),
        prisma.pendingCalendarProposal.delete({ where: { patientId } }),
      ]);
      return {
        promptBlock: `\n\n[방금 일정 추가함]\n"${pending.title}"을(를) ${formatDateLabel(pending.date)} 일정에 추가했다고 짧게 확인해주세요.`,
        justConfirmed: true,
      };
    }
    // 확인도 명백한 거부도 아니면(다른 화제로 넘어감 등) 대기 상태를 계속 유지한다 -
    // 다음 턴에 다시 판단한다. 명백히 무관한 대답이 계속 반복될 위험보다, 조용히
    // 사라지는 제안이 없는 쪽이 낫다(이미 확인을 한 번 물어봤으니 프롬프트에 다시
    // 안내하지 않으면 사용자는 잊혀졌다고 느낄 수 있어 계속 들고 있는다).
    return {
      promptBlock: `\n\n[확인 대기 중인 일정]\n"${pending.title}" (${formatDateLabel(pending.date)})을(를) 일정에 추가할지 아직 답을 못 들었습니다. 자연스럽으면 다시 한번 짧게 확인해주세요.`,
      justConfirmed: false,
    };
  }

  const detected = await detectCalendarIntent(latestUserText);
  if (!detected) return { promptBlock: "", justConfirmed: false };

  const date = new Date(detected.date);
  await prisma.pendingCalendarProposal.upsert({
    where: { patientId },
    create: { patientId, title: detected.title, date },
    update: { title: detected.title, date, createdAt: new Date() },
  });

  return {
    promptBlock: `\n\n[제안할 일정]\n"${detected.title}"을(를) ${formatDateLabel(date)} 일정에 추가할지 자연스럽게 한 번 물어보세요(예: "${detected.title} 일정에 추가해드릴까요?"). 강요하지 마세요.`,
    justConfirmed: false,
  };
}

/**
 * 과거 60일 ~ 미래 14일 사이의 일정을 프롬프트에 항상 주입한다(buildUpcomingFamilyPlans와
 * 같은 패턴 - lib/memory/familyContext.ts 참고). LLM이 "그날 뭐였지" 같은 질문에
 * 관련 있을 때만 참고한다.
 */
export async function buildRecentCalendarEvents(patientId: string): Promise<string> {
  const now = new Date();
  const since = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const until = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const events = await prisma.calendarEvent.findMany({
    where: { patientId, date: { gte: since, lte: until } },
    orderBy: { date: "asc" },
    take: 30,
    select: { title: true, date: true, notes: true },
  });
  if (events.length === 0) return "";

  return events
    .map((e) => `- ${formatDateLabel(e.date)} ${e.title}${e.notes ? ` (${e.notes})` : ""}`)
    .join("\n");
}
