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
    // KST 기준 오늘 자정 (00:00:00) 계산
    const kstDateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(now);
    const startOfToday = new Date(`${kstDateStr}T00:00:00.000+09:00`);
    const until = new Date(startOfToday.getTime() + 14 * 24 * 60 * 60 * 1000);

    const [familyMembers, calendarEvents, familyTasks, familyPlans, recentMessages, latestNewMessage, due] = await Promise.all([
      prisma.familyMember.findMany({
        where: { patientId },
        take: 4,
        orderBy: { createdAt: "asc" },
        select: { name: true, relation: true },
      }).catch(() => []),
      prisma.calendarEvent.findMany({
        where: { patientId, date: { gte: startOfToday, lte: until } },
        orderBy: { date: "asc" },
        take: 5,
        select: { title: true, date: true },
      }).catch(() => []),
      prisma.familyTask.findMany({
        where: { patientId, dueDate: { gte: startOfToday, lte: until }, completed: false },
        orderBy: { dueDate: "asc" },
        take: 5,
        select: { title: true, dueDate: true },
      }).catch(() => []),
      prisma.familyPlan.findMany({
        where: { patientId, date: { gte: startOfToday, lte: until } },
        orderBy: { date: "asc" },
        take: 5,
        select: { title: true, date: true },
      }).catch(() => []),
      prisma.familyMessage.findMany({
        where: { patientId },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, fromName: true, content: true, photoUrl: true },
      }).catch(() => []),
      prisma.familyMessage.findFirst({
        where: { patientId, deliveredAt: null },
        orderBy: { createdAt: "desc" },
        select: { id: true, fromName: true, content: true, photoUrl: true },
      }).catch(() => null),
      findDueUnconfirmedMedication(patientId).catch(() => null),
    ]);

    const combined = [
      ...calendarEvents.map((e) => ({ title: e.title, date: e.date })),
      ...familyTasks.map((t) => ({ title: t.title, date: t.dueDate! })),
      ...familyPlans.map((p) => ({ title: p.title, date: p.date })),
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const upcomingEvent = combined[0] ?? null;
    const dueMedication = due ? { id: due.id, name: due.name, dosage: due.dosage, time: due.reminderTime } : null;

    return Response.json({
      familyMembers,
      upcomingEvent: upcomingEvent ? { title: upcomingEvent.title, date: new Date(upcomingEvent.date).toISOString() } : null,
      recentMessages,
      latestNewMessage,
      dueMedication,
    });
  } catch (err) {
    console.error("Dashboard GET error:", err);
    return Response.json({ familyMembers: [], upcomingEvent: null, recentMessages: [], dueMedication: null });
  }
}
