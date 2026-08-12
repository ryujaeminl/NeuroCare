// Upstage는 UPSTAGE_API_KEY가 한 번도 설정된 적 없어 이 기능이 실질적으로 한 번도
// 동작한 적이 없었고(Pinecone 인덱스도 차원이 안 맞았다 - 아래 EMBEDDING_DIMENSION
// 참고), 사용자 요청으로 같은 Azure 리소스에 실제 배포한 text-embedding-3-large로
// 교체했다.
const AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;
const AZURE_OPENAI_API_KEY = process.env.AZURE_OPENAI_API_KEY;
const EMBEDDING_MODEL = process.env.AZURE_OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-large";

/**
 * Upstage는 저장용/검색용 임베딩 모델이 분리돼있었지만, OpenAI 임베딩은 하나의
 * 모델을 양쪽에 그대로 쓴다. 호출부(pineconeClient.ts) 인터페이스를 그대로
 * 유지하기 위해 파라미터는 남기되 내부에서는 쓰지 않는다.
 */
export type EmbeddingPurpose = "passage" | "query";

/** Pinecone 인덱스를 만들 때 필요한 차원 수. text-embedding-3-large는 3072차원이다. */
export const EMBEDDING_DIMENSION = 3072;

export function isEmbeddingConfigured(): boolean {
  return Boolean(AZURE_OPENAI_ENDPOINT && AZURE_OPENAI_API_KEY);
}

export async function embedText(text: string, purpose: EmbeddingPurpose): Promise<number[]> {
  void purpose; // OpenAI 임베딩은 하나의 모델을 저장/검색 양쪽에 그대로 쓴다 - 위 EmbeddingPurpose 주석 참고.
  if (!AZURE_OPENAI_ENDPOINT || !AZURE_OPENAI_API_KEY) {
    throw new Error("AZURE_OPENAI_ENDPOINT / AZURE_OPENAI_API_KEY가 설정되지 않았습니다.");
  }

  const response = await fetch(`${AZURE_OPENAI_ENDPOINT.replace(/\/$/, "")}/openai/v1/embeddings`, {
    method: "POST",
    headers: { "api-key": AZURE_OPENAI_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`임베딩 생성 실패 (${response.status}): ${detail}`);
  }

  const data = (await response.json()) as { data?: Array<{ embedding?: number[] }> };
  const embedding = data.data?.[0]?.embedding;
  if (!embedding) {
    throw new Error("임베딩 응답 형식이 올바르지 않습니다.");
  }
  return embedding;
}
