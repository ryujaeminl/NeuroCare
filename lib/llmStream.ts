export interface ChatMessage {
  /** system은 대화 기록에는 안 남기고 이번 LLM 호출에만 상황을 알려주는 힌트용 (barge-in 등) */
  role: "user" | "assistant" | "system";
  content: string;
}

export interface StreamChatOptions {
  /** 청크가 도착할 때마다 호출 (지금까지 누적된 전체 텍스트를 넘겨준다) */
  onChunk?: (fullTextSoFar: string) => void;
  /** 문장 하나가 완성될 때마다 호출 - TTS에 바로 넘기기 위함 */
  onSentence?: (sentence: string) => void;
  signal?: AbortSignal;
}

const SENTENCE_BOUNDARY = /([.!?。]|\n)\s*/;

/** Upstage Solar 스트리밍 응답을 /api/chat 프록시로 요청하고, 문장 단위로도 알려준다. */
export async function streamChat(
  messages: ChatMessage[],
  options: StreamChatOptions = {},
): Promise<string> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
    signal: options.signal,
  });

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || "LLM 요청에 실패했습니다.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  let sentenceBuffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    full += chunk;
    sentenceBuffer += chunk;
    options.onChunk?.(full);

    let match = sentenceBuffer.match(SENTENCE_BOUNDARY);
    while (match && match.index !== undefined) {
      const boundaryEnd = match.index + match[0].length;
      const sentence = sentenceBuffer.slice(0, boundaryEnd).trim();
      sentenceBuffer = sentenceBuffer.slice(boundaryEnd);
      if (sentence) options.onSentence?.(sentence);
      match = sentenceBuffer.match(SENTENCE_BOUNDARY);
    }
  }

  const trailing = sentenceBuffer.trim();
  if (trailing) options.onSentence?.(trailing);

  return full.trim();
}
