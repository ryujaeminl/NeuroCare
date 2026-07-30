import { NextRequest } from "next/server";
import { isClovaVoiceConfigured, synthesizeWithClova } from "@/lib/tts/clovaVoice";

const BACKEND_URL = process.env.WHISPER_BACKEND_URL ?? "http://127.0.0.1:8000";

/**
 * CLOVA Voice를 기본으로 쓴다(목소리 품질 우선). 실측상 edge-tts(~0.55초, 스트리밍)가
 * CLOVA(~2.2초, 비스트리밍)보다 훨씬 빠르지만, 목소리 톤은 CLOVA를 선호한다는 피드백에
 * 따라 되돌린다 - 이 상태에서는 "대화 입력 후 2초 내 응답"은 구조적으로 불가능하다
 * (CLOVA 합성 한 번만으로 이미 2초를 넘김). edge-tts는 CLOVA 실패 시에만 폴백으로 쓴다.
 */
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
