import { NextRequest } from "next/server";
import { authErrorResponse, requirePatientSelf } from "@/lib/auth/permissions";
import { deleteEnrollment, enrollVoice, getEnrollmentStatus } from "@/lib/whisperClient";

/** GET - 내 목소리가 등록되어 있는지 */
export async function GET() {
  try {
    const session = await requirePatientSelf();
    return Response.json({ enrolled: await getEnrollmentStatus(session.user.id) });
  } catch (err) {
    return authErrorResponse(err) ?? Response.json({ error: "조회 실패" }, { status: 500 });
  }
}

/** POST - 녹음한 음성으로 내 성문을 등록한다. 이후 내 목소리만 대화로 인정된다. */
export async function POST(request: NextRequest) {
  try {
    const session = await requirePatientSelf();
    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof Blob)) {
      return Response.json({ error: "file 필드가 필요합니다." }, { status: 400 });
    }

    const result = await enrollVoice(file, session.user.id);
    return Response.json({ enrolled: true, duration: result.duration }, { status: 201 });
  } catch (err) {
    const authResponse = authErrorResponse(err);
    if (authResponse) return authResponse;
    const message = err instanceof Error ? err.message : "등록에 실패했습니다.";
    return Response.json({ error: message }, { status: 502 });
  }
}

/** DELETE - 등록 해제 (개인정보 삭제 요청 대응) */
export async function DELETE() {
  try {
    const session = await requirePatientSelf();
    await deleteEnrollment(session.user.id);
    return Response.json({ deleted: true });
  } catch (err) {
    return authErrorResponse(err) ?? Response.json({ error: "해제 실패" }, { status: 500 });
  }
}
