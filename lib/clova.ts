import axios from 'axios';

export async function generateClovaTTS(text: string): Promise<ArrayBuffer> {
  const clientId = process.env.CLOVA_VOICE_CLIENT_ID || '';
  const clientSecret = process.env.CLOVA_VOICE_CLIENT_SECRET || '';
  // NCP 콘솔에 "CLOVA Voice - Premium"으로 등록된 Application이라 Premium 전용 엔드포인트를 사용해야 함
  const url = 'https://naveropenapi.apigw.ntruss.com/tts-premium/v1/tts';

  try {
    const response = await axios.post(
      url,
      `speaker=nara&speed=0&text=${encodeURIComponent(text)}`,
      {
        headers: {
          'X-NCP-APIGW-API-KEY-ID': clientId,
          'X-NCP-APIGW-API-KEY': clientSecret,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        responseType: 'arraybuffer' as const
      }
    );
    return response.data;
  } catch (error) {
    console.error('TTS Error:', error);
    throw new Error('TTS 생성 실패');
  }
}
