// 복약 알림 스케줄링의 핵심 로직(자정 경계 처리, JSON 직렬화 왕복)만 DB 없이 빠르게
// 검증한다. 실행: npx tsx scripts/check-reminder-scheduling.ts
import assert from "node:assert";
import { isValidTimeString, parseReminderTimes, serializeReminderTimes } from "../lib/db/types";
import { findDueDateKey } from "../lib/guardian/medicationReminderDispatcher";

// 직렬화/역직렬화 왕복
assert.deepStrictEqual(parseReminderTimes(serializeReminderTimes(["08:00", "20:30"])), ["08:00", "20:30"]);
// 깨진 JSON/잘못된 시각 형식은 조용히 걸러진다
assert.deepStrictEqual(parseReminderTimes("not json"), []);
assert.deepStrictEqual(parseReminderTimes(JSON.stringify(["25:00", "08:00", "abc"])), ["08:00"]);

assert.ok(isValidTimeString("00:00"));
assert.ok(isValidTimeString("23:59"));
assert.ok(!isValidTimeString("24:00"));
assert.ok(!isValidTimeString("8:00"));

// 정상 케이스: 같은 날 안에서 매칭
assert.strictEqual(findDueDateKey("08:00", new Date("2026-07-30T08:00:00+09:00"), 15), "2026-07-30");
assert.strictEqual(findDueDateKey("08:00", new Date("2026-07-30T08:07:00+09:00"), 15), "2026-07-30");
assert.strictEqual(findDueDateKey("08:00", new Date("2026-07-30T07:59:00+09:00"), 15), null); // 아직 안 됨
assert.strictEqual(findDueDateKey("08:00", new Date("2026-07-30T08:20:00+09:00"), 15), null); // 창을 벗어남

// 자정 경계: 23:55 예약이 다음날 00:05(창 안)에도 정확히 "전날 날짜"로 매칭돼야 한다 -
// 문자열 뺄셈 방식(HH:MM만 비교)이었을 때는 이 케이스를 그냥 놓쳤다.
assert.strictEqual(findDueDateKey("23:55", new Date("2026-07-31T00:05:00+09:00"), 15), "2026-07-30");
// 같은 자정 매칭이 이후 틱(00:10)에서도 "같은" 전날 날짜를 가리켜야 dedup이 먹힌다 -
// 서로 다른 dateKey로 쪼개지면 두 번 보내는 문제가 생긴다.
assert.strictEqual(findDueDateKey("23:55", new Date("2026-07-31T00:10:00+09:00"), 15), "2026-07-30");

console.log("reminder scheduling checks passed");
