import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { authErrorResponse, requireGuardianAccess, requirePatientAccess } from "@/lib/auth/permissions";

interface PlanInput {
  patientId?: string;
  title?: string;
  date?: string;
  notes?: string | null;
}

function validate(body: PlanInput) {
  if (!body.patientId || !body.title?.trim() || !body.date) {
    throw new Error("환자, 일정 제목, 날짜는 필수입니다.");
  }
}

/** GET /api/guardian/plans?patientId=... - 다가오는 순으로 정렬된 가족 일정 */
export async function GET(request: NextRequest) {
  try {
    const patientId = request.nextUrl.searchParams.get("patientId") ?? "";
    if (!patientId) return Response.json({ error: "patientId가 필요합니다." }, { status: 400 });
    await requirePatientAccess(patientId);

    const plans = await prisma.familyPlan.findMany({
      where: { patientId },
      orderBy: { date: "asc" },
    });
    return Response.json({ plans });
  } catch (err) {
    return authErrorResponse(err) ?? Response.json({ error: "조회 실패" }, { status: 500 });
  }
}

/** POST /api/guardian/plans - 가족 일정 등록 (보호자만) */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as PlanInput;
    validate(body);
    const session = await requireGuardianAccess(body.patientId!);

    const plan = await prisma.familyPlan.create({
      data: {
        patientId: body.patientId!,
        title: body.title!.trim(),
        date: new Date(body.date!),
        notes: body.notes?.trim() || null,
        addedBy: session.user.id,
      },
    });
    return Response.json({ plan }, { status: 201 });
  } catch (err) {
    const authResponse = authErrorResponse(err);
    if (authResponse) return authResponse;
    const message = err instanceof Error ? err.message : "등록 실패";
    return Response.json({ error: message }, { status: 400 });
  }
}
