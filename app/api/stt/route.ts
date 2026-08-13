import { NextRequest, NextResponse } from "next/server";
import { transcribeAudio } from "@/lib/whisperClient";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const file = form.get("file");
  const sessionId = form.get("session_id");

  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "file 필드가 필요합니다." }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_FOUNDRY_API_KEY;

  if (apiKey) {
    try {
      const openAiForm = new FormData();
      openAiForm.append("file", file, "audio.webm");
      openAiForm.append("model", "whisper-1");
      openAiForm.append("language", "ko");

      const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: openAiForm,
      });

      if (res.ok) {
        const data = (await res.json()) as { text?: string };
        if (data.text) {
          return NextResponse.json({ text: data.text, language: "ko" });
        }
      }
    } catch {}
  }

  try {
    const result = await transcribeAudio(
      file,
      "recording.webm",
      undefined,
      typeof sessionId === "string" ? sessionId : undefined,
    );
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "전사에 실패했습니다.";
    return NextResponse.json({ error: message, text: "" }, { status: 200 });
  }
}
