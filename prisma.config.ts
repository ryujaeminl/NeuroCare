import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// Prisma 7은 .env를 자동으로 읽지 않으므로 직접 로드한다.
// DATABASE_URL은 .env에 둔다 (Prisma CLI는 Next.js 전용인 .env.local을 로드하지 않는다).
loadEnv();

// Prisma 7부터 datasource URL은 스키마가 아니라 이 파일에서 읽는다.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL ?? "file:./dev.db",
  },
  migrations: {
    seed: "npx tsx prisma/seed.ts",
  },
});
