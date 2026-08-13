import { prisma } from "@/lib/db/prisma";
import { requirePatientSelf, authErrorResponse } from "@/lib/auth/permissions";
import { parseReminderTimes } from "@/lib/db/types";
import { findDueDateKey } from "@/lib/guardian/medicationReminderDispatcher";

/** 배너로 보여주는 용도라 크론의 발송 창(15분)보다 조금 더 넉넉하게 잡는다 - 이미 지나간
 * 시간도 잠깐은 "복용 시간이에요"로 보여야 자연스럽다. */
const DUE_DISPLAY_WINDOW_MINUTES = 30;

/**
 * 환자 홈 화면 하단 카드들이 쓰는 요약 정보. app/page.tsx의 예전 하드코딩된 가짜 데이터
 * (가족 연결/오늘의 계획/가족 메시지/복약 알림)를 대체한다.
 * 가족 메시지는 내용을 여기서 바로 보여주지 않는다 - 대화 중 AI가 동의를 구하고 전달하는
 * 기존 설계(lib/memory/familyContext.ts)와 맞추려고 "누가 남겼는지"만 알려준다.
 */
export async function GET() {
  try {
    const session = await requirePatientSelf();
    const patientId = session.user.id;
    const now = new Date();
    const until = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    const [familyMembers, upcomingPlan, upcomingEvent, pendingMessage, medications] = await Promise.all([
      prisma.familyMember.findMany({
        where: { patientId },
        take: 4,
        orderBy: { createdAt: "asc" },
        select: { name: true, relation: true },
      }),
      prisma.familyPlan.findFirst({
        where: { patientId, date: { gte: now, lte: until } },
        orderBy: { date: "asc" },
        select: { title: true, date: true },
      }),
      // FamilyPlan(방문/생일 등 가족 일정)과 별개다 - 보호자가 웹에서 등록하거나
      // 환자가 대화 중 확인한 실제 캘린더 일정(CalendarEvent)은 지금까지 홈 화면
      // 어디에도 안 보였다(네이티브 폰 캘린더 동기화나 AI 음성 언급으로만 확인
      // 가능했음) - "일정란에 안 뜬다"는 보고와 일치해서 카드로 노출한다.
      prisma.calendarEvent.findFirst({
        where: { patientId, date: { gte: now, lte: until } },
        orderBy: { date: "asc" },
        select: { title: true, date: true },
      }),
      prisma.familyMessage.findFirst({
        where: { patientId, deliveredAt: null },
        orderBy: { createdAt: "asc" },
        select: { fromName: true },
      }),
      prisma.medication.findMany({
        where: { patientId, startDate: { lte: now }, OR: [{ endDate: null }, { endDate: { gte: now } }] },
        select: { name: true, dosage: true, reminderTimes: true },
      }),
    ]);

    let dueMedication: { name: string; dosage: string; time: string } | null = null;
    for (const medication of medications) {
      for (const time of parseReminderTimes(medication.reminderTimes)) {
        if (findDueDateKey(time, now, DUE_DISPLAY_WINDOW_MINUTES)) {
          dueMedication = { name: medication.name, dosage: medication.dosage, time };
          break;
        }
      }
      if (dueMedication) break;
    }

    return Response.json({
      familyMembers,
      upcomingPlan: upcomingPlan ? { title: upcomingPlan.title, date: upcomingPlan.date.toISOString() } : null,
      upcomingEvent: upcomingEvent ? { title: upcomingEvent.title, date: upcomingEvent.date.toISOString() } : null,
      pendingMessageFrom: pendingMessage?.fromName ?? null,
      dueMedication,
    });
  } catch (err) {
    return authErrorResponse(err) ?? Response.json({ error: "불러오지 못했습니다." }, { status: 500 });
  }
}
