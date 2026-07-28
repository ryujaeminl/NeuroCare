import { NextRequest } from "next/server";
import { isClovaVoiceConfigured, synthesizeWithClova } from "@/lib/tts/clovaVoice";

const BACKEND_URL = process.env.WHISPER_BACKEND_URL ?? "http://127.0.0.1:8000";

export async function POST(request: NextRequest) {
  const { text, voice } = (await request.json()) as { text: string; voice?: string };

  if (isClovaVoiceConfigured()) {
    try {
      const clovaResponse = await synthesizeWithClova(text);
      if (clovaResponse.ok && clovaResponse.body) {
        return new Response(clovaResponse.body, { headers: { "Content-Type": "audio/mpeg" } });
      }
      const detail = await clovaResponse.text().catch(() => "");
      console.error(`CLOVA Voice 요청 실패 (${clovaResponse.status}): ${detail} - edge-tts로 폴백합니다.`);
    } catch (err) {
      console.error("CLOVA Voice 요청 중 오류 - edge-tts로 폴백합니다.", err);
    }
  }

  // CLOVA Voice가 설정되지 않았거나 실패하면 edge-tts(Python 백엔드)로 폴백한다.
  const upstream = await fetch(`${BACKEND_URL}/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice }),
  });

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    return new Response(detail || "TTS 요청에 실패했습니다.", { status: 502 });
  }

  return new Response(upstream.body, { headers: { "Content-Type": "audio/mpeg" } });
}
