import axios from 'axios';

export async function streamLLMResponse(
  messages: any[],
  systemPrompt: string,
  onToken: (token: string) => void,
  onComplete: () => void
) {
  const apiKey = process.env.EXAONE_API_KEY || '';
  const baseUrl = process.env.EXAONE_API_BASE_URL || 'https://api.friendli.ai/dedicated/v1';
  const endpointId = process.env.EXAONE_ENDPOINT_ID || '';

  let completed = false;
  const finishOnce = () => {
    if (completed) return;
    completed = true;
    onComplete();
  };

  try {
    const response = await axios.post(
      `${baseUrl}/chat/completions`,
      {
        model: endpointId,
        stream: true,
        max_tokens: 150,
        // K-EXAONE는 리즈닝(사고 과정)을 먼저 출력하는 모델이라, 끄지 않으면 답변 전에 max_tokens가 소진될 수 있음
        chat_template_kwargs: { enable_thinking: false },
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ]
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        responseType: 'stream' as const
      }
    );

    response.data.on('data', (chunk: any) => {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            finishOnce();
            return;
          }
          try {
            const parsed = JSON.parse(data);
            const token = parsed.choices?.[0]?.delta?.content || '';
            if (token) {
              onToken(token);
            }
          } catch (e) {
            // 파싱 오류 무시
          }
        }
      }
    });

    response.data.on('end', () => {
      finishOnce();
    });

  } catch (error) {
    console.error('LLM Error:', error);
    throw new Error('LLM 응답 생성 실패');
  }
}
