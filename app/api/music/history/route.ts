import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/authOptions";
import { prisma } from "@/lib/db/prisma";

/**
 * POST /api/music/history - 오버레이 재생이 실제로 시작되면 클라이언트가 기록한다.
 * 실패해도 재생 자체엔 영향 없다(부가 정보) - 클라이언트가 fire-and-forget으로 호출.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "patient") {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { title?: string } | null;
  const title = body?.title?.trim();
  if (!title) {
    return NextResponse.json({ error: "title이 필요합니다." }, { status: 400 });
  }

  try {
    await prisma.playedSong.create({
      data: { patientId: session.user.id, title },
    });
  } catch {
    return NextResponse.json({ error: "이력 저장에 실패했습니다." }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
