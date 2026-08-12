export interface ChatMessage {
  /** system은 대화 기록에는 안 남기고 이번 LLM 호출에만 상황을 알려주는 힌트용 (barge-in 등) */
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatPhoto {
  url: string;
  caption: string | null;
}

export interface StreamChatOptions {
  /** 청크가 도착할 때마다 호출 (지금까지 누적된 전체 텍스트를 넘겨준다) */
  onChunk?: (fullTextSoFar: string) => void;
  /** 문장 하나가 완성될 때마다 호출 - TTS에 바로 넘기기 위함 */
  onSentence?: (sentence: string) => void;
  /** 서버가 이번 턴에 보여줄 사진을 골랐으면 스트림을 읽기 전에 호출 (app/api/chat/route.ts 참고) */
  onPhoto?: (photo: ChatPhoto) => void;
  /** 날씨 질문에 실제로 답하기 위한 대략적 위치. 못 구했으면 생략 - 없어도 대화는 그대로 된다. */
  location?: { lat: number; lon: number };
  /** 서버가 방금 일정을 확인·저장했으면(X-Calendar-Sync 헤더) 호출된다. */
  onCalendarSync?: () => void;
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
    body: JSON.stringify({ messages, location: options.location }),
    signal: options.signal,
  });

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || "LLM 요청에 실패했습니다.");
  }

  const photoUrl = response.headers.get("X-Photo-Url");
  if (photoUrl) {
    const caption = response.headers.get("X-Photo-Caption");
    options.onPhoto?.({
      url: decodeURIComponent(photoUrl),
      caption: caption ? decodeURIComponent(caption) : null,
    });
  }

  if (response.headers.get("X-Calendar-Sync")) {
    options.onCalendarSync?.();
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
