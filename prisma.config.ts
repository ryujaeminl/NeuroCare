import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// Prisma 7은 .env를 자동으로 읽지 않으므로 직접 로드한다.
// DATABASE_URL은 .env에 둔다. TURSO_* 값은 Next.js 전용인 .env.local에 있으므로
// 그것도 함께 읽어야 마이그레이션 CLI가 같은 값을 본다.
loadEnv();
loadEnv({ path: ".env.local", override: true });

const tursoUrl = process.env.TURSO_DATABASE_URL;

// Prisma 7부터 datasource URL은 스키마가 아니라 이 파일에서 읽는다.
// 마이그레이션 CLI는 드라이버 어댑터를 안 쓰므로, Turso auth token은 URL 쿼리로 붙인다.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: tursoUrl
      ? `${tursoUrl}?authToken=${process.env.TURSO_AUTH_TOKEN}`
      : (process.env.DATABASE_URL ?? "file:./dev.db"),
  },
  migrations: {
    seed: "npx tsx prisma/seed.ts",
  },
});
