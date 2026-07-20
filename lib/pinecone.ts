import { Pinecone } from '@pinecone-database/pinecone';

// neurocare-memory 인덱스의 벡터 차원 (Pinecone 콘솔에서 만든 인덱스 설정과 일치해야 함)
export const VECTOR_DIM = 1024;

let pc: Pinecone | null = null;

function getPineconeClient() {
  if (!process.env.PINECONE_API_KEY) {
    throw new Error('Pinecone API 키가 설정되지 않았어요. .env.local에 PINECONE_API_KEY를 추가해주세요.');
  }
  if (!pc) {
    pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
  }
  return pc;
}

export async function getPineconeIndex() {
  const indexName = process.env.PINECONE_INDEX_NAME || 'neurocare-memory';
  const indexHost = process.env.PINECONE_INDEX_HOST || undefined;
  // host를 알고 있으면 describeIndex 호출 없이 바로 연결
  const index = getPineconeClient().index(indexName, indexHost);
  return index;
}

export async function storeMemory(patientId: string, text: string, type: string) {
  const index = await getPineconeIndex();
  const vectorId = `${patientId}_${Date.now()}`;

  // 실제 구현시 임베딩 벡터 사용 필요
  const vector = new Array(VECTOR_DIM).fill(0).map(() => Math.random());

  await index.upsert([{
    id: vectorId,
    values: vector,
    metadata: { patientId, text, type, timestamp: Date.now() }
  }]);
}

export async function retrieveMemory(patientId: string, queryText: string, topK: number = 3) {
  const index = await getPineconeIndex();

  // 실제 구현시 임베딩 벡터 사용 필요
  const queryVector = new Array(VECTOR_DIM).fill(0).map(() => Math.random());

  const results = await index.query({
    vector: queryVector,
    filter: { patientId },
    topK,
    includeMetadata: true
  });

  return results.matches.map((m: any) => m.metadata?.text).filter(Boolean);
}