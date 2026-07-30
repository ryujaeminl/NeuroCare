import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { authErrorResponse, requireGuardianAccess } from "@/lib/auth/permissions";
import { serializeReminderTimes } from "@/lib/db/types";

interface MedicationPatch {
  name?: string;
  dosage?: string;
  frequency?: string;
  startDate?: string;
  endDate?: string | null;
  notes?: string | null;
  reminderTimes?: string[];
}

/** PATCH /api/guardian/medications/:id - 약 정보 수정 (보호자만) */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const existing = await prisma.medication.findUnique({ where: { id } });
    if (!existing) return Response.json({ error: "약 정보를 찾을 수 없습니다." }, { status: 404 });
    await requireGuardianAccess(existing.patientId);

    const body = (await request.json()) as MedicationPatch;
    const medication = await prisma.medication.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name.trim() }),
        ...(body.dosage !== undefined && { dosage: body.dosage.trim() }),
        ...(body.frequency !== undefined && { frequency: body.frequency.trim() }),
        ...(body.startDate !== undefined && { startDate: new Date(body.startDate) }),
        ...(body.endDate !== undefined && { endDate: body.endDate ? new Date(body.endDate) : null }),
        ...(body.notes !== undefined && { notes: body.notes?.trim() || null }),
        ...(body.reminderTimes !== undefined && { reminderTimes: serializeReminderTimes(body.reminderTimes) }),
      },
    });
    return Response.json({ medication });
  } catch (err) {
    const authResponse = authErrorResponse(err);
    if (authResponse) return authResponse;
    return Response.json({ error: "수정 실패" }, { status: 400 });
  }
}

/** DELETE /api/guardian/medications/:id (보호자만) */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const existing = await prisma.medication.findUnique({ where: { id } });
    if (!existing) return Response.json({ error: "약 정보를 찾을 수 없습니다." }, { status: 404 });
    await requireGuardianAccess(existing.patientId);

    await prisma.medication.delete({ where: { id } });
    return Response.json({ deleted: true });
  } catch (err) {
    return authErrorResponse(err) ?? Response.json({ error: "삭제 실패" }, { status: 500 });
  }
}
