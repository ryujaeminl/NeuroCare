import type { TTSProvider } from "./provider";

/**
 * 브라우저에서 호출하는 TTS 클라이언트. 실제로 CLOVA Voice를 쓰는지 edge-tts를 쓰는지는
 * /api/tts 라우트가 서버에서 알아서 고르므로, 클라이언트는 어떤 프로바이더인지 몰라도 된다.
 */
export const ttsProvider: TTSProvider = {
  async synthesize(text, signal) {
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
