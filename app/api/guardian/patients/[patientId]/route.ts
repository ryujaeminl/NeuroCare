import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { authErrorResponse, requireGuardianAccess } from "@/lib/auth/permissions";
import { isDementiaStage } from "@/lib/db/types";

interface PatientPatch {
  /** 빈 문자열/null이면 기본 호출어("복실아")로 되돌아간다. */
  wakeWord?: string | null;
  /** 빈 문자열/null이면 기본 단계("중등도")로 되돌아간다. */
  dementiaStage?: string | null;
}

/** PATCH /api/guardian/patients/:patientId - 호출어/진행 단계 등 환자 설정 수정 (보호자만) */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ patientId: string }> }) {
  try {
    const { patientId } = await params;
    await requireGuardianAccess(patientId);

    const body = (await request.json()) as PatientPatch;
    if (body.dementiaStage && !isDementiaStage(body.dementiaStage)) {
      return Response.json({ error: "진행 단계 값이 올바르지 않습니다." }, { status: 400 });
    }

    const user = await prisma.user.update({
      where: { id: patientId },
      data: {
        ...(body.wakeWord !== undefined && { wakeWord: body.wakeWord?.trim() || null }),
        ...(body.dementiaStage !== undefined && { dementiaStage: body.dementiaStage || null }),
      },
      select: { id: true, wakeWord: true, dementiaStage: true },
    });
    return Response.json({ patient: user });
  } catch (err) {
    const authResponse = authErrorResponse(err);
    if (authResponse) return authResponse;
    return Response.json({ error: "수정 실패" }, { status: 400 });
  }
}
