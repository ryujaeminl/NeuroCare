import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/authOptions";
import { maybeTriggerVoiceDistress } from "@/lib/guardian/emergencyDispatcher";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "patient") {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const { text } = (await request.json()) as { text?: string };
  if (text && text.trim()) {
    // 응답을 막지 않는다 - chat/route.ts의 기존 호출부와 동일하게 fire-and-forget.
    void maybeTriggerVoiceDistress(session.user.id, text);
  }

  return new NextResponse(null, { status: 204 });
}
