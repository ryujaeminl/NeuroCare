/** 네이버 클라우드 CLOVA Voice(Premium TTS) - 서버(Route Handler)에서만 호출한다. */

const CLOVA_ENDPOINT = "https://naveropenapi.apigw.ntruss.com/tts-premium/v1/tts";

const CLIENT_ID = process.env.NCP_CLOVA_CLIENT_ID;
const CLIENT_SECRET = process.env.NCP_CLOVA_CLIENT_SECRET;
// 차분하고 안정적인 톤의 기본 여성 화자. 감정 기복이 큰 화자는 피한다.
const SPEAKER = process.env.NCP_CLOVA_SPEAKER || "nara";

export function isClovaVoiceConfigured(): boolean {
  return Boolean(CLIENT_ID && CLIENT_SECRET);
}

/** CLOVA Voice로 합성한 오디오(mp3)를 그대로 응답하는 fetch Response를 반환한다. */
export async function synthesizeWithClova(text: string): Promise<Response> {
  const body = new URLSearchParams({
    speaker: SPEAKER,
    text,
    volume: "0",
    speed: "-1", // 환자의 인지 처리 시간을 고려해 기본보다 살짝 느리게
    pitch: "0",
    format: "mp3",
  });

  return fetch(CLOVA_ENDPOINT, {
    method: "POST",
    headers: {
      "X-NCP-APIGW-API-KEY-ID": CLIENT_ID ?? "",
      "X-NCP-APIGW-API-KEY": CLIENT_SECRET ?? "",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
}
