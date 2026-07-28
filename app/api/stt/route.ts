import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/authOptions";
import { transcribeAudio } from "@/lib/whisperClient";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "file 필드가 필요합니다." }, { status: 400 });
  }

  // 로그인한 환자면 성문 검증을 함께 요청한다. 성문이 등록되지 않았으면 백엔드가 그냥 전사한다.
  const session = await auth();
  const speakerId = session?.user?.role === "patient" ? session.user.id : undefined;

  try {
    const result = await transcribeAudio(file, "recording.webm", speakerId);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "전사에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
