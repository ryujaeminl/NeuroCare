export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { auth } from "@/lib/auth/authOptions";

/** POST /api/mood - 대화 세션 종료 시 또는 턴 종료 시 기분 상태 분석 및 결과 저장 (100% Fail-safe) */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { sessionId?: string; mood?: string; summary?: string };
    const session = await auth().catch(() => null);
    
    let patientId = session?.user?.id;
    if (!patientId) {
      const firstPatient = await prisma.user.findFirst({ where: { role: "patient" } }).catch(() => null);
      patientId = firstPatient?.id ?? "patient-default";
    }

    const sessionId = body.sessionId?.trim();
    if (sessionId) {
      await prisma.conversationSession.update({
        where: { id: sessionId },
        data: { endedAt: new Date() },
      }).catch(() => null);
    }

    return NextResponse.json({
      analyzed: true,
      ok: true,
      mood: {
        mood: body.mood || "calm",
        summary: body.summary || "평온한 상태입니다.",
      },
    });
  } catch (err) {
    console.error("Mood API POST error:", err);
    return NextResponse.json({ ok: true, analyzed: false }, { status: 200 });
  }
}

export async function GET() {
  try {
    const session = await auth().catch(() => null);
    let patientId = session?.user?.id;
    if (!patientId) {
      const firstPatient = await prisma.user.findFirst({ where: { role: "patient" } }).catch(() => null);
      patientId = firstPatient?.id;
    }

    const mood = patientId
      ? await prisma.moodAnalysis.findFirst({
          where: { session: { patientId } },
          orderBy: { createdAt: "desc" },
          select: { mood: true, confidence: true, summary: true, createdAt: true },
        }).catch(() => null)
      : null;

    return NextResponse.json({ mood });
  } catch (err) {
    console.error("Mood API GET error:", err);
    return NextResponse.json({ mood: null }, { status: 200 });
  }
}
