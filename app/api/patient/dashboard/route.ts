import { prisma } from "@/lib/db/prisma";
import { requirePatientSelf, authErrorResponse } from "@/lib/auth/permissions";
import { findDueUnconfirmedMedication } from "@/lib/medication/dueMedicationContext";

/**
 * 환자 홈 화면 하단 카드들이 쓰는 요약 정보. app/page.tsx의 예전 하드코딩된 가짜 데이터
 * (가족 연결/오늘의 계획/가족 메시지/복약 알림)를 대체한다.
 * "오늘의 계획"(FamilyPlan) 카드는 사용자 요청으로 "가족 메시지" 카드로 대체됐다 -
 * 가족 메시지는 원래 내용을 안 보여주고 "누가 남겼는지"만 알려줬는데(대화 중 AI가
 * 동의를 구하고 전달하는 설계, lib/memory/familyContext.ts), 카드 자체가 안 보인다는
 * 확인 후 아예 화면에서 바로 읽을 수 있는 목록으로 바꿨다. 대화 중 AI가 언급하는
 * 기존 흐름은 그대로 둔다(deliveredAt은 여기서 안 건드림 - 중복이어도 무해하다).
 */
export async function GET() {
  try {
    const session = await requirePatientSelf();
    const patientId = session.user.id;
    const now = new Date();
    const until = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    const [familyMembers, upcomingEvent, recentMessages, due] = await Promise.all([
      prisma.familyMember.findMany({
        where: { patientId },
        take: 4,
        orderBy: { createdAt: "asc" },
        select: { name: true, relation: true },
      }),
      // 보호자가 웹에서 등록하거나 환자가 대화 중 확인한 실제 캘린더 일정(CalendarEvent) -
      // 지금까지 홈 화면 어디에도 안 보였다(네이티브 폰 캘린더 동기화나 AI 음성 언급으로만
      // 확인 가능했음) - "일정란에 안 뜬다"는 보고와 일치해서 카드로 노출한다.
      prisma.calendarEvent.findFirst({
        where: { patientId, date: { gte: now, lte: until } },
        orderBy: { date: "asc" },
        select: { title: true, date: true },
      }),
      prisma.familyMessage.findMany({
        where: { patientId },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, fromName: true, content: true, photoUrl: true },
      }),
      // realtime 음성 확인("약 드셨어요?")과 같은 함수를 써서 판정을 맞춘다 - 음성으로
      // 이미 확인된 약은 배너에도 안 뜨고, 배너 버튼으로 확인하면 음성 쪽도 다시 안 물어본다.
      findDueUnconfirmedMedication(patientId),
    ]);
    const dueMedication = due ? { id: due.id, name: due.name, dosage: due.dosage, time: due.reminderTime } : null;

    return Response.json({
      familyMembers,
      upcomingEvent: upcomingEvent ? { title: upcomingEvent.title, date: upcomingEvent.date.toISOString() } : null,
      recentMessages,
      dueMedication,
    });
  } catch (err) {
    return authErrorResponse(err) ?? Response.json({ error: "불러오지 못했습니다." }, { status: 500 });
  }
}
