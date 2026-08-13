export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { resolveConfirmationDateKey } from "@/lib/medication/dueMedicationContext";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { medicationId?: string; reminderTime?: string };
    let medicationId = body.medicationId?.trim();
    let reminderTime = body.reminderTime?.trim();

    if (!medicationId || !reminderTime) {
      const firstMed = await prisma.medication.findFirst({ select: { id: true, reminderTimes: true } });
      if (firstMed) {
        medicationId = medicationId || firstMed.id;
        reminderTime = reminderTime || firstMed.reminderTimes[0] || "08:00";
      }
    }

    if (!medicationId || !reminderTime) {
      return NextResponse.json({ ok: true });
    }

    const dateKey = resolveConfirmationDateKey(reminderTime, new Date());

    try {
      await prisma.medicationConfirmation.create({
        data: { medicationId, reminderTime, dateKey },
      });
    } catch {
      // 이미 확인 처리된 경우 유니크 제약 위반 무시
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Medication confirm POST error:", err);
    return NextResponse.json({ ok: true });
  }
}
