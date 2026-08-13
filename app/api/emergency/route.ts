export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/authOptions";
import { dispatchEmergency } from "@/lib/guardian/emergencyDispatcher";

const PATIENT_TRIGGER_TYPES = new Set(["voice_distress", "manual_button", "session_timeout"]);

interface EmergencyInput {
  patientId?: string;
  triggerType?: string;
  detail?: string;
}

/** POST /api/emergency - 환자가 긴급 상황을 알린다 (긴급 호출 버튼, '살려줘' 음성 감지 등) */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as EmergencyInput;
    const triggerType = body.triggerType && PATIENT_TRIGGER_TYPES.has(body.triggerType) ? body.triggerType : "voice_distress";

    let patientId = body.patientId?.trim();
    if (!patientId) {
      const session = await auth();
      if (session?.user?.id && session.user.role === "patient") {
        patientId = session.user.id;
      }
    }

    if (!patientId) {
      const firstPatient = await prisma.user.findFirst({ where: { role: "patient" } });
      patientId = firstPatient?.id ?? "patient-default";
    }

    const event = await prisma.emergencyEvent.create({
      data: {
        patientId,
        triggerType,
        detail: body.detail?.trim() || "긴급 SOS 신호 발생",
      },
    });

    try {
      await dispatchEmergency(event.id);
    } catch (e) {
      console.warn("dispatchEmergency notice error:", e);
    }

    return NextResponse.json({ event }, { status: 201 });
  } catch (err) {
    console.error("Emergency POST error:", err);
    return NextResponse.json({ error: "긴급 알림 생성 중 오류 발생" }, { status: 500 });
  }
}

/** GET /api/emergency - 보호자가 연동된 환자들의 미확인 긴급 이벤트를 본다 */
export async function GET() {
  try {
    const session = await auth();
    let patientIds: string[] = [];

    if (session?.user?.linkedPatientIds && session.user.linkedPatientIds.length > 0) {
      patientIds = session.user.linkedPatientIds;
    }

    const whereClause = patientIds.length > 0
      ? { patientId: { in: patientIds }, status: "open" }
      : { status: "open" };

    const events = await prisma.emergencyEvent.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      include: { patient: { select: { name: true } } },
    });
    return NextResponse.json({ events });
  } catch (err) {
    console.error("Emergency GET error:", err);
    return NextResponse.json({ events: [] });
  }
}
