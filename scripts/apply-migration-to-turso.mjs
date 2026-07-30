// 일회성 스크립트: Prisma Migrate 엔진은 datasource provider가 "sqlite"일 때 file: 스킴만
// 이해해서 Turso(libsql://)에 직접 migrate를 못 돌린다(드라이버 어댑터는 런타임 전용이라
// migrate 엔진과 무관). 그래서 로컬 dev.db에 대해 생성된 migration.sql을 @libsql/client로
// 직접 Turso에 적용한다. 사용법: node scripts/apply-migration-to-turso.mjs <migration.sql 경로>
import { createClient } from "@libsql/client";
import { config as loadEnv } from "dotenv";
import { readFileSync } from "node:fs";

loadEnv({ path: ".env.local" });

const sqlPath = process.argv[2];
if (!sqlPath) {
  console.error("사용법: node scripts/apply-migration-to-turso.mjs <migration.sql 경로>");
  process.exit(1);
}

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url || !authToken) {
  console.error("TURSO_DATABASE_URL / TURSO_AUTH_TOKEN이 .env.local에 필요합니다.");
  process.exit(1);
}

const sql = readFileSync(sqlPath, "utf8");
const client = createClient({ url, authToken });

try {
  await client.executeMultiple(sql);
  console.log("Turso에 마이그레이션 적용 완료:", sqlPath);
} finally {
  client.close();
}
