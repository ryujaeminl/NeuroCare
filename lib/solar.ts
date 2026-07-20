import axios from 'axios';

// Whisper가 받아쓴 원문을 Upstage Solar로 문맥에 맞게 교정 (오타/잘못 알아들은 단어 보정)
export async function correctTranscript(rawText: string): Promise<string> {
  const apiKey = process.env.SOLAR_API_KEY || '';
  if (!apiKey || !rawText.trim()) return rawText;

  const baseUrl = process.env.SOLAR_API_BASE_URL || 'https://api.upstage.ai/v1/solar';
  const model = process.env.SOLAR_MODEL || 'solar-1-mini-chat';

  try {
    const response = await axios.post(
      `${baseUrl}/chat/completions`,
      {
        model,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content:
              '당신은 노인/치매 환자의 음성을 받아쓴 한국어 텍스트를 교정하는 전문가입니다. ' +
              'Whisper 음성인식 결과에는 오타, 잘못 알아들은 단어, 띄어쓰기 오류가 있을 수 있습니다. ' +
              '문맥에 맞게 자연스럽게 교정하되, 원래 의미와 화자의 의도는 절대 바꾸지 마세요. ' +
              '교정된 문장만 출력하고, 다른 설명이나 따옴표는 붙이지 마세요.',
          },
          { role: 'user', content: rawText },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const corrected = response.data?.choices?.[0]?.message?.content?.trim();
    return corrected || rawText;
  } catch (error) {
    console.error('Solar 교정 오류:', error);
    return rawText; // 교정 실패 시 원문 그대로 사용 (전체 흐름이 끊기지 않도록)
  }
}
