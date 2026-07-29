import { NextRequest } from "next/server";
import { isClovaVoiceConfigured, synthesizeWithClova } from "@/lib/tts/clovaVoice";

const BACKEND_URL = process.env.WHISPER_BACKEND_URL ?? "http://127.0.0.1:8000";

/**
 * edge-tts를 기본으로 쓴다. 실측 결과 CLOVA Voice는 짧은 문장도 합성에 ~2.2초가 걸리고
 * 스트리밍도 안 되는데(전체 합성이 끝나야 응답), edge-tts(GPU 서버)는 첫 바이트까지 ~0.55초에
 * 실제 스트리밍까지 된다 - 대화 첫 응답이 화면 텍스트보다 한참 늦게 나오던 원인이었다.
 * CLOVA는 실패 시에만(또는 명시적으로 강제할 때만) 폴백으로 남겨둔다.
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
