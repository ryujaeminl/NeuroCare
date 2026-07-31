import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { authErrorResponse, requireGuardianAccess, requirePatientAccess } from "@/lib/auth/permissions";

interface MessageInput {
  patientId?: string;
  fromName?: string;
  content?: string;
}

function validate(body: MessageInput) {
  if (!body.patientId || !body.fromName?.trim() || !body.content?.trim()) {
    throw new Error("환자, 보낸 사람, 메시지 내용은 필수입니다.");
  }
}

/** GET /api/guardian/messages?patientId=... - 남긴 메시지 목록(최신순) */
export async function GET(request: NextRequest) {
  try {
    const patientId = request.nextUrl.searchParams.get("patientId") ?? "";
    if (!patientId) return Response.json({ error: "patientId가 필요합니다." }, { status: 400 });
    await requirePatientAccess(patientId);

    const messages = await prisma.familyMessage.findMany({
      where: { patientId },
      orderBy: { createdAt: "desc" },
    });
    return Response.json({ messages });
  } catch (err) {
    return authErrorResponse(err) ?? Response.json({ error: "조회 실패" }, { status: 500 });
  }
}

/** POST /api/guardian/messages - 환자에게 남길 메시지 등록 (보호자만) */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as MessageInput;
    validate(body);
    const session = await requireGuardianAccess(body.patientId!);

    const message = await prisma.familyMessage.create({
      data: {
        patientId: body.patientId!,
        fromName: body.fromName!.trim(),
        content: body.content!.trim(),
        addedBy: session.user.id,
      },
    });
    return Response.json({ message }, { status: 201 });
  } catch (err) {
    const authResponse = authErrorResponse(err);
    if (authResponse) return authResponse;
    const message = err instanceof Error ? err.message : "등록 실패";
    return Response.json({ error: message }, { status: 400 });
  }
}
