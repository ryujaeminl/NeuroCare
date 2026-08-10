// "사진 보여드릴까요?"에 대한 환자 대답 판별(isAffirmativeReply)만 DB 없이 빠르게 검증한다.
// 부정 패턴을 먼저 걸러야 "아니 근데 좋아요" 같은 문장에서 오탐이 안 난다 - 순서가 로직의
// 핵심이라 회귀가 생기기 쉬운 지점이다. 실행: npx tsx scripts/check-photo-context.ts
import assert from "node:assert";
import { isAffirmativeReply } from "../lib/memory/photoContext";

// 긍정
assert.ok(isAffirmativeReply("네"));
assert.ok(isAffirmativeReply("응 보여줘"));
assert.ok(isAffirmativeReply("좋아요"));
assert.ok(isAffirmativeReply("궁금해요"));

// 부정
assert.ok(!isAffirmativeReply("아니요"));
assert.ok(!isAffirmativeReply("아니 괜찮아"));
assert.ok(!isAffirmativeReply("나중에 볼게요"));

// 애매/무관한 대답은 긍정으로 오인하면 안 된다 (동의 없이 사진을 띄우는 것보다는
// 한 번 더 물어보는 쪽이 안전하다)
assert.ok(!isAffirmativeReply("오늘 날씨가 좋네요"));
assert.ok(!isAffirmativeReply(""));
assert.ok(!isAffirmativeReply("   "));

// "아니"로 시작하지만 뒤에 긍정어가 붙는 경우 - 부정 패턴이 먼저 걸려야 한다
assert.ok(!isAffirmativeReply("아니 좋아요"));

console.log("photo context checks passed");
