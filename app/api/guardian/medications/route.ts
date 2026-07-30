import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { authErrorResponse, requireGuardianAccess, requirePatientAccess } from "@/lib/auth/permissions";
import { serializeReminderTimes } from "@/lib/db/types";

interface MedicationInput {
  patientId?: string;
  name?: string;
  dosage?: string;
  frequency?: string;
  startDate?: string;
  endDate?: string | null;
  notes?: string | null;
  /** "HH:MM" 24시간제 - 이 시각마다 medicationReminderOptIn 켠 보호자에게 알림이 간다. */
  reminderTimes?: string[];
}

function validate(body: MedicationInput) {
  if (!body.patientId || !body.name?.trim() || !body.dosage?.trim() || !body.frequency?.trim() || !body.startDate) {
    throw new Error("환자, 약 이름, 용량, 복용 주기, 시작일은 필수입니다.");
  }
}

/** GET /api/guardian/medications?patientId=... - 등록된 약 목록 */
export async function GET(request: NextRequest) {
  try {
    const patientId = request.nextUrl.searchParams.get("patientId") ?? "";
    if (!patientId) return Response.json({ error: "patientId가 필요합니다." }, { status: 400 });
    await requirePatientAccess(patientId);

    const medications = await prisma.medication.findMany({
      where: { patientId },
      orderBy: { startDate: "desc" },
    });
    return Response.json({ medications });
  } catch (err) {
    return authErrorResponse(err) ?? Response.json({ error: "조회 실패" }, { status: 500 });
  }
}

/** POST /api/guardian/medications - 약 등록 (보호자만) */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as MedicationInput;
    validate(body);
    const session = await requireGuardianAccess(body.patientId!);

    const medication = await prisma.medication.create({
      data: {
        patientId: body.patientId!,
        name: body.name!.trim(),
        dosage: body.dosage!.trim(),
        frequency: body.frequency!.trim(),
        startDate: new Date(body.startDate!),
        endDate: body.endDate ? new Date(body.endDate) : null,
        notes: body.notes?.trim() || null,
        reminderTimes: serializeReminderTimes(body.reminderTimes ?? []),
        addedBy: session.user.id,
      },
    });
    return Response.json({ medication }, { status: 201 });
  } catch (err) {
    const authResponse = authErrorResponse(err);
    if (authResponse) return authResponse;
    const message = err instanceof Error ? err.message : "등록 실패";
    return Response.json({ error: message }, { status: 400 });
  }
}
