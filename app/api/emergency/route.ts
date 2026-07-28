import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { authErrorResponse, requirePatientSelf, requireSession } from "@/lib/auth/permissions";
import { dispatchEmergency } from "@/lib/guardian/emergencyDispatcher";

/** 환자가 직접 만들 수 있는 트리거만 여기서 받는다. mood_critical은 서버(mood 분석)만 만든다. */
const PATIENT_TRIGGER_TYPES = new Set(["voice_distress", "manual_button", "session_timeout"]);

interface EmergencyInput {
  triggerType?: string;
  detail?: string;
}

/** POST /api/emergency - 환자가 긴급 상황을 알린다 (긴급 호출 버튼 등) */
export async function POST(request: NextRequest) {
  try {
    const session = await requirePatientSelf();
    const body = (await request.json()) as EmergencyInput;

    if (!body.triggerType || !PATIENT_TRIGGER_TYPES.has(body.triggerType)) {
      return Response.json({ error: "잘못된 triggerType입니다." }, { status: 400 });
    }

    const event = await prisma.emergencyEvent.create({
      data: {
        patientId: session.user.id,
        triggerType: body.triggerType,
        detail: body.detail?.trim() || null,
      },
    });

    await dispatchEmergency(event.id);

    return Response.json({ event }, { status: 201 });
  } catch (err) {
    return authErrorResponse(err) ?? Response.json({ error: "긴급 알림 생성 실패" }, { status: 500 });
  }
}

/** GET /api/emergency - 보호자가 연동된 환자들의 미확인 긴급 이벤트를 본다 */
export async function GET() {
  try {
    const session = await requireSession();
    if (session.user.linkedPatientIds.length === 0) return Response.json({ events: [] });

    const events = await prisma.emergencyEvent.findMany({
      where: { patientId: { in: session.user.linkedPatientIds }, status: "open" },
      orderBy: { createdAt: "desc" },
      include: { patient: { select: { name: true } } },
    });
    return Response.json({ events });
  } catch (err) {
    return authErrorResponse(err) ?? Response.json({ error: "조회 실패" }, { status: 500 });
  }
}
