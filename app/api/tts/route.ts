import { NextRequest } from "next/server";
import { isClovaVoiceConfigured, synthesizeWithClova } from "@/lib/tts/clovaVoice";

const BACKEND_URL = process.env.WHISPER_BACKEND_URL ?? "http://127.0.0.1:8000";

/**
 * edge-tts를 기본으로 쓴다(속도 우선). 실측상 edge-tts(~0.55초, 스트리밍)가
 * CLOVA(~2.2초, 비스트리밍)보다 훨씬 빠르다 - 응답 속도를 최대한 줄이기로 한
 * 결정에 따라 되돌림. CLOVA는 edge-tts 실패 시에만 폴백으로 쓴다.
 */
export async function POST(request: NextRequest) {
  const { text, voice } = (await request.json()) as { text: string; voice?: string };

  try {
    const upstream = await fetch(`${BACKEND_URL}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice }),
    });
    if (upstream.ok && upstream.body) {
      return new Response(upstream.body, { headers: { "Content-Type": "audio/mpeg" } });
    }
    const detail = await upstream.text().catch(() => "");
    console.error(`edge-tts 요청 실패 (${upstream.status}): ${detail} - CLOVA로 폴백합니다.`);
  } catch (err) {
    console.error("edge-tts 요청 중 오류 - CLOVA로 폴백합니다.", err);
  }

  if (isClovaVoiceConfigured()) {
    const clovaResponse = await synthesizeWithClova(text);
    if (clovaResponse.ok && clovaResponse.body) {
      return new Response(clovaResponse.body, { headers: { "Content-Type": "audio/mpeg" } });
    }
    const detail = await clovaResponse.text().catch(() => "");
    return new Response(detail || "TTS 요청에 실패했습니다.", { status: 502 });
  }

  return new Response("TTS 요청에 실패했습니다.", { status: 502 });
}
