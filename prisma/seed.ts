import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { config as loadEnv } from "dotenv";

loadEnv();

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./dev.db" });
const prisma = new PrismaClient({ adapter });

/** 개발용 테스트 계정. 실제 배포에서는 절대 쓰지 말 것. */
async function main() {
  const passwordHash = await hash("test1234", 10);

  const patient = await prisma.user.upsert({
    where: { email: "patient@test.local" },
    update: {},
    create: {
      email: "patient@test.local",
      passwordHash,
      name: "김할머니",
      role: "patient",
      inviteCode: "NEURO-1234",
    },
  });

  const guardian = await prisma.user.upsert({
    where: { email: "guardian@test.local" },
    update: {},
    create: {
      email: "guardian@test.local",
      passwordHash,
      name: "김지민",
      role: "guardian",
    },
  });

  await prisma.patientGuardianLink.upsert({
    where: { patientId_guardianId: { patientId: patient.id, guardianId: guardian.id } },
    update: {},
    create: { patientId: patient.id, guardianId: guardian.id },
  });

  console.log("seed 완료");
  console.log(`  환자   : patient@test.local / test1234 (초대코드 ${patient.inviteCode})`);
  console.log("  보호자 : guardian@test.local / test1234");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
