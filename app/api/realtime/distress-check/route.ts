import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/authOptions";
import { maybeTriggerVoiceDistress } from "@/lib/guardian/emergencyDispatcher";

import { prisma } from "@/lib/db/prisma";

export async function POST(request: NextRequest) {
  const { text, patientId: bodyPatientId } = (await request.json().catch(() => ({}))) as { text?: string; patientId?: string };

  let patientId = bodyPatientId?.trim();
  if (!patientId) {
    const session = await auth();
    if (session?.user?.role === "patient") {
      patientId = session.user.id;
    }
  }

  if (!patientId) {
    const firstPatient = await prisma.user.findFirst({ where: { role: "patient" } });
    patientId = firstPatient?.id ?? "patient-default";
  }

  if (text && text.trim()) {
    await maybeTriggerVoiceDistress(patientId, text);
  }

  return new NextResponse(null, { status: 204 });
}
