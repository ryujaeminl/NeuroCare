import crypto from 'crypto';
import { getPineconeIndex, VECTOR_DIM } from './pinecone';

export interface PublicUser {
  username: string;
  name: string;
  patientId: string;
}

interface UserMetadata extends PublicUser {
  type: 'user';
  passwordHash: string;
  createdAt: number;
}

// 유사도 검색용이 아니라 ID로 직접 조회하는 용도라 값 자체는 의미 없음. Pinecone은 전부 0인 벡터를 거부하므로 미세한 0이 아닌 값을 사용.
const DUMMY_VECTOR = new Array(VECTOR_DIM).fill(0.0001);

function userVectorId(username: string) {
  return `user_${username.trim().toLowerCase()}`;
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(check, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function findUserRecord(username: string): Promise<UserMetadata | null> {
  const index = await getPineconeIndex();
  const id = userVectorId(username);
  const result: any = await index.fetch([id]);
  const record = result?.records?.[id] ?? result?.vectors?.[id];
  if (!record?.metadata) return null;
  return record.metadata as UserMetadata;
}

export async function createUser(username: string, password: string, name: string): Promise<PublicUser> {
  const existing = await findUserRecord(username);
  if (existing) {
    throw new Error('이미 사용 중인 아이디예요.');
  }

  const index = await getPineconeIndex();
  const id = userVectorId(username);
  const patientId = id;

  const metadata: UserMetadata = {
    type: 'user',
    username: username.trim(),
    name: name.trim(),
    patientId,
    passwordHash: hashPassword(password),
    createdAt: Date.now(),
  };

  await index.upsert([{ id, values: DUMMY_VECTOR, metadata: metadata as any }]);

  return { username: metadata.username, name: metadata.name, patientId };
}

export async function authenticateUser(username: string, password: string): Promise<PublicUser> {
  const record = await findUserRecord(username);
  if (!record || !verifyPassword(password, record.passwordHash)) {
    throw new Error('아이디 또는 비밀번호가 올바르지 않아요.');
  }
  return { username: record.username, name: record.name, patientId: record.patientId };
}
