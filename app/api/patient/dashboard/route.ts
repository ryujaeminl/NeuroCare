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
import { auth } from "@/lib/auth/authOptions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    let patientId: string | null = null;
    const session = await auth().catch(() => null);
    if (session?.user?.id && session.user.role === "patient") {
      patientId = session.user.id;
    }
    if (!patientId) {
      const firstPatient = await prisma.user.findFirst({ where: { role: "patient" } });
      patientId = firstPatient?.id ?? "patient-default";
    }

    const now = new Date();
    const until = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    const [familyMembers, upcomingEvent, recentMessages, due] = await Promise.all([
      prisma.familyMember.findMany({
        where: { patientId },
        take: 4,
        orderBy: { createdAt: "asc" },
        select: { name: true, relation: true },
      }).catch(() => []),
      prisma.calendarEvent.findFirst({
        where: { patientId, date: { gte: now, lte: until } },
        orderBy: { date: "asc" },
        select: { title: true, date: true },
      }).catch(() => null),
      prisma.familyMessage.findMany({
        where: { patientId },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, fromName: true, content: true, photoUrl: true },
      }).catch(() => []),
      findDueUnconfirmedMedication(patientId).catch(() => null),
    ]);
    const dueMedication = due ? { id: due.id, name: due.name, dosage: due.dosage, time: due.reminderTime } : null;

    return Response.json({
      familyMembers,
      upcomingEvent: upcomingEvent ? { title: upcomingEvent.title, date: upcomingEvent.date.toISOString() } : null,
      recentMessages,
      dueMedication,
    });
  } catch (err) {
    console.error("Dashboard GET error:", err);
    return Response.json({ familyMembers: [], upcomingEvent: null, recentMessages: [], dueMedication: null });
  }
}
