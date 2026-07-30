import type { TTSProvider } from "./provider";

// GPU edge-tts 서버를 브라우저에서 직접 호출한다(Vercel(/api/tts) 왕복 한 홉을 줄인다 -
// 네이티브 쉘의 WakeWordService는 이미 이 서버를 직접 호출 중이었다). 실패하면(네트워크/
// CORS/edge-tts 자체 장애 등) /api/tts 경유 경로(edge-tts 재시도 -> CLOVA 폴백)로 이어간다.
const DIRECT_BACKEND_URL = process.env.NEXT_PUBLIC_WHISPER_BACKEND_URL;

/**
 * 브라우저에서 호출하는 TTS 클라이언트. 직접 호출이 실패했을 때만 /api/tts 라우트로
 * 넘어가고, 거기서 실제로 CLOVA Voice를 쓰는지 edge-tts를 쓰는지는 서버가 알아서 고른다.
 */
export const ttsProvider: TTSProvider = {
  async synthesize(text, signal) {
    if (DIRECT_BACKEND_URL) {
      try {
        const direct = await fetch(`${DIRECT_BACKEND_URL}/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
          body: JSON.stringify({ text }),
          signal,
        });
        if (direct.ok) return direct.blob();
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") throw err;
        // 직접 호출 실패 - 아래 Vercel 경유 폴백으로 이어간다.
      }
    }

    const response = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(detail || `TTS 요청 실패 (${response.status})`);
    }

    return response.blob();
  },
};
