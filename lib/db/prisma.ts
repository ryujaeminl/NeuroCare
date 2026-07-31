import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "@prisma/client";

// Next.js 개발 모드는 HMR마다 모듈을 다시 평가하므로, 전역에 캐시해두지 않으면
// 커넥션이 계속 쌓인다.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function createPrismaClient() {
  // Vercel 서버리스는 파일시스템이 읽기전용이라 better-sqlite3(로컬 파일)를 못 연다.
  // TURSO_DATABASE_URL이 있으면 그쪽(호스팅 SQLite)을 쓰고, 없으면 로컬 개발용 파일로 접속한다.
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const adapter = tursoUrl
    ? new PrismaLibSql({ url: tursoUrl, authToken: process.env.TURSO_AUTH_TOKEN })
    : new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./dev.db" });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
