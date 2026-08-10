import { Pinecone } from "@pinecone-database/pinecone";
import { embedText } from "@/lib/memory/embedClient";

const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_INDEX = process.env.PINECONE_INDEX || "neurocare-memory";

export interface MemoryRecord {
  turnId: string;
  patientId: string;
  sessionId: string;
  role: string;
  text: string;
  createdAt: Date;
}

export interface SimilarMemory {
  /** upsert 시 쓴 벡터 ID - kind가 "family_memory"면 Prisma Memory.id와 같다
   * (upsertFamilyMemory에서 record.memoryId를 그대로 id로 쓴다). */
  id: string;
  text: string;
  role: string;
  createdAt: string;
  score: number;
  /** "turn"(과거 대화) | "family_memory"(보호자가 입력한 기억). 기본값은 "turn". */
  kind: string;
}

export interface FamilyMemoryRecord {
  memoryId: string;
  patientId: string;
  title: string;
  content: string;
  createdAt: Date;
}

/**
 * Pinecone은 선택 사항이다. 키가 없으면 대화는 SQLite에만 저장되고 유사 대화 검색(RAG)만
 * 비활성화된다. lib/tts/clovaVoice.ts의 isClovaVoiceConfigured()와 같은 패턴이다.
 */
export function isPineconeConfigured(): boolean {
  return Boolean(PINECONE_API_KEY);
}

let cachedClient: Pinecone | null = null;

function getIndex() {
  if (!PINECONE_API_KEY) return null;
  cachedClient ??= new Pinecone({ apiKey: PINECONE_API_KEY });
  return cachedClient.index(PINECONE_INDEX);
}

/**
 * 대화 한 턴을 벡터로 저장한다. 실패해도 예외를 던지지 않는다 —
 * 기억 저장이 안 된다고 진행 중인 대화가 끊기면 안 되기 때문이다.
 * 성공 시 벡터 ID를, 실패하거나 미설정이면 null을 반환한다.
 */
export async function upsertMemory(record: MemoryRecord): Promise<string | null> {
  const index = getIndex();
  if (!index) return null;

  try {
    const values = await embedText(record.text, "passage");
    await index.upsert({
      records: [
        {
          id: record.turnId,
          values,
          metadata: {
            patientId: record.patientId,
            sessionId: record.sessionId,
            role: record.role,
            text: record.text,
            createdAt: record.createdAt.toISOString(),
          },
        },
      ],
    });
    return record.turnId;
  } catch {
    return null;
  }
}

/**
 * 보호자가 입력한 가족 기억을 벡터로 저장한다. 대화 턴과 같은 인덱스를 공유하고
 * metadata.kind로만 구분한다 - 대화 중 검색할 때 둘을 함께 찾아야 하기 때문이다.
 */
export async function upsertFamilyMemory(record: FamilyMemoryRecord): Promise<string | null> {
  const index = getIndex();
  if (!index) return null;

  try {
    const text = `${record.title}: ${record.content}`;
    const values = await embedText(text, "passage");
    await index.upsert({
      records: [
        {
          id: record.memoryId,
          values,
          metadata: {
            patientId: record.patientId,
            kind: "family_memory",
            text,
            createdAt: record.createdAt.toISOString(),
          },
        },
      ],
    });
    return record.memoryId;
  } catch {
    return null;
  }
}

export async function deleteFamilyMemory(memoryId: string): Promise<void> {
  const index = getIndex();
  if (!index) return;
  try {
    await index.deleteMany([memoryId]);
  } catch {
    // 벡터 삭제 실패가 DB 삭제까지 막지 않도록 조용히 넘어간다.
  }
}

/** topK는 "가장 가까운 것들"을 무조건 채워서 돌려준다 - 진짜 비슷한 기억이 하나도 없어도
 * 제일 덜 다른 3개를 돌려준다는 뜻이다. 그걸 그대로 "참고할 과거 대화/기억"이라고
 * 프롬프트에 박아 넣으면, 특히 reasoning_effort를 낮춰 둔 상태에서는 모델이 무관한
 * 옛날 얘기를 억지로 끌어와 지금 대화와 안 맞는 방향으로 흘러가는 원인이 된다.
 * 진짜 관련 있다고 볼 최소 유사도 밑이면 아예 후보에서 뺀다. */
const MIN_MEMORY_RELEVANCE = Number(process.env.MEMORY_RELEVANCE_THRESHOLD ?? 0.5);

/**
 * 과거 대화 중 지금 발화와 의미가 비슷한 것을 찾는다.
 * 다른 환자의 기억이 섞이지 않도록 patientId로 필터링한다.
 */
export async function searchMemories(
  patientId: string,
  query: string,
  topK = 3,
): Promise<SimilarMemory[]> {
  const index = getIndex();
  if (!index) return [];

  try {
    const values = await embedText(query, "query");
    const result = await index.query({
      vector: values,
      topK,
      includeMetadata: true,
      filter: { patientId },
    });

    return (result.matches ?? [])
      .map((match) => ({
        id: match.id,
        text: String(match.metadata?.text ?? ""),
        role: String(match.metadata?.role ?? ""),
        createdAt: String(match.metadata?.createdAt ?? ""),
        score: match.score ?? 0,
        kind: String(match.metadata?.kind ?? "turn"),
      }))
      .filter((memory) => memory.text.length > 0 && memory.score >= MIN_MEMORY_RELEVANCE);
  } catch {
    return [];
  }
}

/** 환자가 자신의 기록을 지울 때 벡터도 함께 지운다(개인정보 삭제 요청 대응). */
export async function deleteMemories(turnIds: string[]): Promise<void> {
  const index = getIndex();
  if (!index || turnIds.length === 0) return;
  try {
    await index.deleteMany(turnIds);
  } catch {
    // 벡터 삭제 실패가 SQLite 삭제까지 막지 않도록 조용히 넘어간다.
  }
}
