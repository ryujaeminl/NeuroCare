import { NextRequest, NextResponse } from "next/server";
import { transcribeAudio } from "@/lib/whisperClient";

// 화자 인증(성문)은 등록 음성이 짧고 음소가 단조로워 본인 목소리까지 종종 거부하는
// 문제가 반복돼(server/speaker.py 주석 참고) 걷어냈다 - 전사는 항상 그대로 진행한다.
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "file 필드가 필요합니다." }, { status: 400 });
  }

  try {
    const result = await transcribeAudio(file, "recording.webm");
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "전사에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
