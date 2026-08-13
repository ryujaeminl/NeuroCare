import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { authErrorResponse, requireGuardianAccess, requirePatientAccess } from "@/lib/auth/permissions";
import { putPhoto, UploadError } from "@/lib/guardian/storageClient";

/** GET /api/guardian/messages?patientId=... - 남긴 메시지 목록(최신순) */
export async function GET(request: NextRequest) {
  try {
    let patientId = request.nextUrl.searchParams.get("patientId") ?? "";
    if (!patientId) {
      const firstPatient = await prisma.user.findFirst({ where: { role: "patient" } }).catch(() => null);
      patientId = firstPatient?.id ?? "";
    }

    const messages = await prisma.familyMessage.findMany({
      where: patientId ? { patientId } : undefined,
      orderBy: { createdAt: "desc" },
    });
    return Response.json({ messages });
  } catch {
    const messages = await prisma.familyMessage.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
    }).catch(() => []);
    return Response.json({ messages });
  }
}

/**
 * POST /api/guardian/messages - 환자에게 남길 메시지 등록 (보호자만).
 * multipart/form-data: patientId, fromName, content, file?(사진, 선택).
 */
export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const patientId = String(form.get("patientId") ?? "");
    const fromName = String(form.get("fromName") ?? "").trim();
    const content = String(form.get("content") ?? "").trim();
    if (!patientId || !fromName || !content) {
      return Response.json({ error: "환자, 보낸 사람, 메시지 내용은 필수입니다." }, { status: 400 });
    }
    const session = await requireGuardianAccess(patientId);

    const file = form.get("file");
    const photoUrl = file instanceof Blob && file.size > 0 ? await putPhoto(file, patientId) : null;

    const message = await prisma.familyMessage.create({
      data: { patientId, fromName, content, photoUrl, addedBy: session.user.id },
    });
    return Response.json({ message }, { status: 201 });
  } catch (err) {
    const authResponse = authErrorResponse(err);
    if (authResponse) return authResponse;
    const message = err instanceof UploadError ? err.message : "등록 실패";
    return Response.json({ error: message }, { status: 400 });
  }
}
