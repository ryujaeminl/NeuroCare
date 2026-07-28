const UPSTAGE_API_KEY = process.env.UPSTAGE_API_KEY;
const EMBEDDINGS_ENDPOINT = "https://api.upstage.ai/v1/embeddings";

/**
 * Upstage 임베딩 모델은 저장용/검색용이 분리되어 있다. 같은 벡터 공간이지만
 * 각각의 용도에 맞게 학습되어 있어 섞어 쓰면 검색 품질이 떨어진다.
 */
export type EmbeddingPurpose = "passage" | "query";

/** Pinecone 인덱스를 만들 때 필요한 차원 수. Upstage 임베딩은 4096차원이다. */
export const EMBEDDING_DIMENSION = 4096;

export function isEmbeddingConfigured(): boolean {
  return Boolean(UPSTAGE_API_KEY);
}

export async function embedText(text: string, purpose: EmbeddingPurpose): Promise<number[]> {
  if (!UPSTAGE_API_KEY) {
    throw new Error("UPSTAGE_API_KEY가 설정되지 않았습니다.");
  }

  const response = await fetch(EMBEDDINGS_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${UPSTAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: `embedding-${purpose}`, input: text }),
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
