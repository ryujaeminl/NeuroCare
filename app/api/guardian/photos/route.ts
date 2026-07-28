import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { authErrorResponse, requireGuardianAccess, requirePatientAccess } from "@/lib/auth/permissions";
import { putPhoto, UploadError } from "@/lib/guardian/storageClient";

/** GET /api/guardian/photos?patientId=...&familyMemberId=...&memoryId=... */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const patientId = params.get("patientId") ?? "";
    if (!patientId) return Response.json({ error: "patientId가 필요합니다." }, { status: 400 });
    await requirePatientAccess(patientId);

    const familyMemberId = params.get("familyMemberId");
    const memoryId = params.get("memoryId");
    const photos = await prisma.photo.findMany({
      where: {
        patientId,
        ...(familyMemberId && { familyMemberId }),
        ...(memoryId && { memoryId }),
      },
      orderBy: { createdAt: "desc" },
      include: { familyMember: { select: { id: true, name: true } } },
    });
    return Response.json({ photos });
  } catch (err) {
    return authErrorResponse(err) ?? Response.json({ error: "조회 실패" }, { status: 500 });
  }
}

/** POST /api/guardian/photos - multipart/form-data: file, patientId, familyMemberId?, memoryId?, caption? */
export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const patientId = String(form.get("patientId") ?? "");
    if (!patientId) return Response.json({ error: "patientId가 필요합니다." }, { status: 400 });
    const session = await requireGuardianAccess(patientId);

    const file = form.get("file");
    if (!(file instanceof Blob)) {
      return Response.json({ error: "file 필드가 필요합니다." }, { status: 400 });
    }

    const url = await putPhoto(file, patientId);
    const familyMemberId = form.get("familyMemberId");
    const memoryId = form.get("memoryId");
    const caption = form.get("caption");

    const photo = await prisma.photo.create({
      data: {
        patientId,
        familyMemberId: familyMemberId ? String(familyMemberId) : null,
        memoryId: memoryId ? String(memoryId) : null,
        url,
        caption: caption ? String(caption) : null,
        addedBy: session.user.id,
      },
    });
    return Response.json({ photo }, { status: 201 });
  } catch (err) {
    const authResponse = authErrorResponse(err);
    if (authResponse) return authResponse;
    const message = err instanceof UploadError ? err.message : "업로드 실패";
    return Response.json({ error: message }, { status: 400 });
  }
}
