-- 하루 한 세션만 만들도록 강제하는 유니크 제약. dateKey는 과거 행에는 채우지 않는다
-- (SQLite는 유니크 제약에서 NULL끼리 서로 겹치지 않는 것으로 취급하므로 이력에는 영향 없다).
-- Prisma migrate가 Turso(libsql://)를 인식하지 못해(P1013) 이 SQL은 @libsql/client로
-- 직접 실행했다 - 이 파일은 기록 목적으로만 남긴다.
ALTER TABLE "ConversationSession" ADD COLUMN "dateKey" TEXT;
CREATE UNIQUE INDEX "ConversationSession_patientId_dateKey_key" ON "ConversationSession"("patientId", "dateKey");
