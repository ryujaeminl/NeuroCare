import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { authErrorResponse, requireGuardianAccess, requirePatientAccess } from "@/lib/auth/permissions";

interface TaskInput {
  patientId?: string;
  title?: string;
  dueDate?: string | null;
}

function validate(body: TaskInput) {
  if (!body.patientId || !body.title?.trim()) {
    throw new Error("환자와 할 일 제목은 필수입니다.");
  }
}

/** GET /api/guardian/tasks?patientId=... - 보호자끼리 조율하는 할 일 목록 (환자 대화와 무관) */
export async function GET(request: NextRequest) {
  try {
    const patientId = request.nextUrl.searchParams.get("patientId") ?? "";
    if (!patientId) return Response.json({ error: "patientId가 필요합니다." }, { status: 400 });
    await requirePatientAccess(patientId);

    const tasks = await prisma.familyTask.findMany({
      where: { patientId },
      orderBy: [{ completed: "asc" }, { createdAt: "desc" }],
    });
    return Response.json({ tasks });
  } catch (err) {
    return authErrorResponse(err) ?? Response.json({ error: "조회 실패" }, { status: 500 });
  }
}

/** POST /api/guardian/tasks - 할 일 등록 (보호자만) */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as TaskInput;
    validate(body);
    const session = await requireGuardianAccess(body.patientId!);

    const dueDate = body.dueDate ? new Date(body.dueDate) : new Date();

    const task = await prisma.familyTask.create({
      data: {
        patientId: body.patientId!,
        title: body.title!.trim(),
        dueDate,
        addedBy: session.user.id,
      },
    });

    await prisma.calendarEvent.create({
      data: {
        patientId: body.patientId!,
        title: body.title!.trim(),
        date: dueDate,
        source: "guardian_web",
      },
    }).catch(() => null);

    return Response.json({ task }, { status: 201 });
  } catch (err) {
    const authResponse = authErrorResponse(err);
    if (authResponse) return authResponse;
    const message = err instanceof Error ? err.message : "등록 실패";
    return Response.json({ error: message }, { status: 400 });
  }
}
