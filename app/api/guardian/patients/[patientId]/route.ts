import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { authErrorResponse, requireGuardianAccess } from "@/lib/auth/permissions";

interface PatientPatch {
  /** 빈 문자열/null이면 기본 호출어("복실아")로 되돌아간다. */
  wakeWord?: string | null;
}

/** PATCH /api/guardian/patients/:patientId - 호출어 등 환자 설정 수정 (보호자만) */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ patientId: string }> }) {
  try {
    const { patientId } = await params;
    await requireGuardianAccess(patientId);

    const body = (await request.json()) as PatientPatch;
    const user = await prisma.user.update({
      where: { id: patientId },
      data: {
        ...(body.wakeWord !== undefined && { wakeWord: body.wakeWord?.trim() || null }),
      },
      select: { id: true, wakeWord: true },
    });
    return Response.json({ patient: user });
  } catch (err) {
    const authResponse = authErrorResponse(err);
    if (authResponse) return authResponse;
    return Response.json({ error: "수정 실패" }, { status: 400 });
  }
}
