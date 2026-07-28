import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { authErrorResponse, requireSession } from "@/lib/auth/permissions";

/** GET - 환자 본인의 초대 코드 조회 (보호자에게 알려줄 코드) */
export async function GET() {
  try {
    const session = await requireSession();
    if (session.user.role !== "patient") {
      return Response.json({ error: "환자 계정만 초대 코드를 가집니다." }, { status: 403 });
    }
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { inviteCode: true },
    });
    return Response.json({ inviteCode: user?.inviteCode ?? null });
  } catch (err) {
    return authErrorResponse(err) ?? Response.json({ error: "조회 실패" }, { status: 500 });
  }
}

/** POST - 보호자가 초대 코드를 입력해 환자와 연동 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    if (session.user.role !== "guardian") {
      return Response.json({ error: "보호자 계정만 연동할 수 있습니다." }, { status: 403 });
    }

    const { inviteCode } = (await request.json()) as { inviteCode?: string };
    if (!inviteCode) {
      return Response.json({ error: "초대 코드를 입력해주세요." }, { status: 400 });
    }

    const patient = await prisma.user.findUnique({
      where: { inviteCode: inviteCode.trim().toUpperCase() },
      select: { id: true, name: true, role: true },
    });
    if (!patient || patient.role !== "patient") {
      return Response.json({ error: "존재하지 않는 초대 코드입니다." }, { status: 404 });
    }

    await prisma.patientGuardianLink.upsert({
      where: {
        patientId_guardianId: { patientId: patient.id, guardianId: session.user.id },
      },
      update: {},
      create: { patientId: patient.id, guardianId: session.user.id },
    });

    return Response.json({ linked: { id: patient.id, name: patient.name } }, { status: 201 });
  } catch (err) {
    return authErrorResponse(err) ?? Response.json({ error: "연동 실패" }, { status: 500 });
  }
}

/** DELETE - 연동 해제. 환자·보호자 어느 쪽에서든 끊을 수 있다. */
export async function DELETE(request: NextRequest) {
  try {
    const session = await requireSession();
    const { patientId, guardianId } = (await request.json()) as {
      patientId?: string;
      guardianId?: string;
    };

    // 자기가 당사자인 연결만 끊을 수 있게 강제한다.
    const target =
      session.user.role === "guardian"
        ? { patientId: patientId ?? "", guardianId: session.user.id }
        : { patientId: session.user.id, guardianId: guardianId ?? "" };

    if (!target.patientId || !target.guardianId) {
      return Response.json({ error: "대상이 지정되지 않았습니다." }, { status: 400 });
    }

    await prisma.patientGuardianLink.deleteMany({ where: target });
    return Response.json({ ok: true });
  } catch (err) {
    return authErrorResponse(err) ?? Response.json({ error: "해제 실패" }, { status: 500 });
  }
}
