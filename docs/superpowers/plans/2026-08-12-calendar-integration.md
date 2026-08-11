# 휴대폰 네이티브 캘린더 연동 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 환자가 대화로 말한 일정(확인 후)과 보호자가 웹에서 등록한 일정을 서버 DB에
저장하고, 환자 휴대폰의 진짜 네이티브 캘린더에도 반영하며, 대화 중 "그날 뭐였지" 같은
질문에 실제 등록된 일정으로 답할 수 있게 한다.

**Architecture:** 서버 DB(`CalendarEvent`)가 소스 오브 트루스. 환자 앱(Desktop/Neurocare)의
`chat/route.ts`가 대화에서 일정 의도를 감지→확인→저장하고, 안 동기화된 일정을 네이티브
Android CalendarContract로 밀어넣는다. 보호자 앱(Neurocare_care)은 같은 DB에 바로
쓰고, 대시보드에서 조회만 한다.

**Tech Stack:** Next.js API routes, Prisma(SQLite/Turso 공유 DB), Upstage Solar API
(구조화 추출용 별도 호출), Android Kotlin(CalendarContract, WebView JS 브릿지).

## Global Constraints

- 두 저장소가 같은 물리 DB를 공유한다 - 새 테이블(CalendarEvent, PendingCalendarProposal)
  마이그레이션은 환자 앱(Desktop/Neurocare)에서만 만든다. 보호자 앱(Neurocare_care)은
  schema.prisma에 필드 선언만 맞추고 새 마이그레이션은 만들지 않는다(기존
  dementiaStage 이식 때와 동일한 패턴 - 컬럼이 이미 있는데 또 만들면 배포 시 에러).
- 로컬 검증은 항상 Turso 없는 격리된 로컬 `dev.db`로 한다(`.env.local`을 AUTH_SECRET만
  남기고 잠깐 치워두는 이번 세션 내내 써온 방식). 라이브 DB에 스키마 변경을 절대 직접
  하지 않는다.
- 이 프로젝트는 테스트 프레임워크가 없다(package.json에 test 스크립트/vitest/jest 없음).
  검증은 `npx tsc --noEmit`, `npx eslint <file>`, 그리고 가능하면 실제 API/스크립트
  호출로 한다 - 이번 세션 내내 쓴 방식 그대로.
- Android 코드 검증은 `cd android && ./gradlew.bat compileDebugKotlin`로 컴파일만
  확인한다(실기기 설치 전까지는 이게 최선).
- 커밋 메시지는 한국어, `type: 설명` 형식(fix/feat/docs/perf 등, 이 저장소 관례).

---

## 파일 구조

**환자 앱 (`Desktop/Neurocare`):**
- `prisma/schema.prisma` - CalendarEvent, PendingCalendarProposal 모델 추가
- `lib/calendar/detectCalendarIntent.ts` (신규) - LLM 구조화 추출, DB 없음, 순수 함수
- `lib/calendar/calendarEvents.ts` (신규) - DB 읽기/쓰기 + 프롬프트 블록 빌더
- `app/api/chat/route.ts` (수정) - 캘린더 흐름을 시스템 프롬프트/응답 헤더에 연결
- `app/api/calendar-events/unsynced/route.ts` (신규) - GET, 안 동기화된 일정 목록
- `app/api/calendar-events/[id]/synced/route.ts` (신규) - POST, 동기화 완료 표시
- `android/app/src/main/AndroidManifest.xml` (수정) - WRITE_CALENDAR 권한
- `android/app/src/main/java/com/neurocare/app/MainActivity.kt` (수정) - 브릿지 +
  동기화 트리거
- `lib/llmStream.ts` (수정) - 응답 헤더로 동기화 필요 신호 전달
- `hooks/useConversationEngine.ts` (수정) - 신호 받으면 네이티브 브릿지 호출

**보호자 앱 (`Neurocare_care` - 로컬 클론 `C:\Users\youja\Desktop\Neurocare_care_work`):**
- `prisma/schema.prisma` (수정) - CalendarEvent 필드 선언만 추가(마이그레이션 없음)
- `app/api/guardian/calendar-events/route.ts` (신규) - GET/POST
- `app/api/guardian/calendar-events/[id]/route.ts` (신규) - DELETE
- `components/guardian/CalendarEventList.tsx` (신규) - 목록+등록 폼 (FamilyPlanList 패턴)
- `app/(guardian)/page.tsx` (수정) - CalendarEventList 섹션 추가

---

## Task 1: Prisma 스키마 - CalendarEvent, PendingCalendarProposal (환자 앱)

**Files:**
- Modify: `prisma/schema.prisma`
- Create: 마이그레이션 (명령으로 자동 생성)

**Interfaces:**
- Produces: `CalendarEvent { id, patientId, title, date, notes, source, addedBy,
  syncedToDeviceAt, createdAt }`, `PendingCalendarProposal { patientId(PK), title,
  date, createdAt }` - 이후 모든 태스크가 이 필드명을 그대로 쓴다.

- [ ] **Step 1: FamilyPlan 모델 위치 확인**

`prisma/schema.prisma`에서 `model FamilyPlan {` 블록(약 253번 줄)을 찾는다. 이 모델
바로 뒤에 새 모델 두 개를 추가한다.

- [ ] **Step 2: 스키마에 모델 추가**

`model FamilyPlan { ... }` 블록 닫는 `}` 바로 다음 줄에 추가:

```prisma
/// 대화 중 음성으로 확인 후 추가되거나(source="patient_voice") 보호자가 웹에서
/// 바로 추가한(source="guardian_web") 일정. 서버 DB가 소스 오브 트루스이고,
/// syncedToDeviceAt이 null이면 아직 환자 휴대폰의 네이티브 캘린더에 반영 전이다.
model CalendarEvent {
  id               String    @id @default(cuid())
  patientId        String
  title            String
  date             DateTime
  notes            String?
  /// "patient_voice" | "guardian_web"
  source           String
  /// 보호자 User.id - source가 patient_voice면 null.
  addedBy          String?
  syncedToDeviceAt DateTime?
  createdAt        DateTime  @default(now())

  patient User @relation(fields: [patientId], references: [id], onDelete: Cascade)

  @@index([patientId])
}

/// 환자가 음성으로 일정을 언급했을 때 "추가할까요?" 확인을 기다리는 상태. 환자당
/// 최대 1개만 대기하고, 새 제안이 들어오면 기존 것은 버린다(여러 개 동시 대기 방지).
model PendingCalendarProposal {
  patientId String   @id
  title     String
  date      DateTime
  createdAt DateTime @default(now())

  patient User @relation(fields: [patientId], references: [id], onDelete: Cascade)
}
```

- [ ] **Step 3: User 모델에 역관계 추가**

`model User { ... }` 블록에서 `familyPlans FamilyPlan[]` 줄을 찾아 바로 아래에 추가:

```prisma
  calendarEvents          CalendarEvent[]
  pendingCalendarProposal PendingCalendarProposal?
```

- [ ] **Step 4: 로컬 dev.db에 마이그레이션 생성 + 적용**

`.env.local`에 `TURSO_DATABASE_URL`이 있으면 로컬 마이그레이션이 라이브 DB를 건드릴
수 있으니, 먼저 격리한다:

```bash
cd "C:\Users\youja\Desktop\Neurocare"
mv .env.local .env.local.bak
grep '^AUTH_SECRET=' .env.local.bak > .env.local
```

마이그레이션 생성(Prisma가 AI 에이전트 감지 시 동의를 요구하면, 사용자에게 명시적으로
물어보고 받은 답변 그대로를 `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` 값으로
써서 재실행):

```bash
npx prisma migrate dev --name calendar_events
```

Expected: `prisma/migrations/<timestamp>_calendar_events/migration.sql` 생성, 로컬
`dev.db`에 적용 완료 메시지.

- [ ] **Step 5: 원상복구**

```bash
rm .env.local
mv .env.local.bak .env.local
wc -l .env.local
```

Expected: 원래 줄 수(18줄)로 복구.

- [ ] **Step 6: 타입 체크**

```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: 출력 없음(에러 없음). `@prisma/client`가 새 모델 타입을 인식하는지 확인.

- [ ] **Step 7: 커밋**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: CalendarEvent/PendingCalendarProposal 모델 추가"
```

---

## Task 2: LLM 기반 일정 의도 추출 (환자 앱)

**Files:**
- Create: `lib/calendar/detectCalendarIntent.ts`

**Interfaces:**
- Consumes: 없음(순수 함수, `process.env.UPSTAGE_API_KEY`/`UPSTAGE_MODEL`만 사용)
- Produces: `detectCalendarIntent(latestUserText: string): Promise<{ title: string;
  date: string } | null>` - Task 3에서 이 함수를 그대로 호출한다. `date`는
  `YYYY-MM-DD` 문자열.

- [ ] **Step 1: 함수 작성**

```typescript
const UPSTAGE_API_KEY = process.env.UPSTAGE_API_KEY;
const UPSTAGE_MODEL = process.env.UPSTAGE_MODEL || "solar-pro4";

/**
 * 환자의 발화에 "일정으로 등록해달라"는 의도가 있는지 별도의 짧은 LLM 호출로
 * 판단한다. 정규식 대신 LLM을 쓰는 이유: "다음 주 화요일" 같은 상대 날짜 표현을
 * 정규식으로 다루기 어렵다. 메인 대화 스트림(chat/route.ts)과 별개의 호출이라
 * 실패해도 대화 자체에는 영향이 없다 - null을 돌려주면 그냥 일정 제안 없이 넘어간다.
 */
export async function detectCalendarIntent(
  latestUserText: string,
): Promise<{ title: string; date: string } | null> {
  if (!UPSTAGE_API_KEY || !latestUserText.trim()) return null;

  const today = new Date().toISOString().slice(0, 10);
  try {
    const response = await fetch("https://api.upstage.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${UPSTAGE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: UPSTAGE_MODEL,
        messages: [
          {
            role: "system",
            content:
              `오늘 날짜는 ${today}입니다. 아래 사용자 발화에 "일정으로 등록해달라"는 ` +
              `의도가 있으면(예: "다음 주 화요일에 병원 가야해", "모레 손녀 온다고 ` +
              `일정에 넣어줘") {"title": "짧은 제목", "date": "YYYY-MM-DD"} 형식의 JSON ` +
              `만 답하세요. 의도가 없으면(그냥 하는 말, 질문, 과거 이야기 등) 정확히 ` +
              `NONE 이라고만 답하세요. JSON이나 NONE 외의 다른 설명은 절대 붙이지 마세요.`,
          },
          { role: "user", content: latestUserText },
        ],
        temperature: 0,
        max_tokens: 100,
        reasoning_effort: "minimal",
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;

    const data = await response.json();
    const text = (data.choices?.[0]?.message?.content ?? "").trim();
    if (!text || text === "NONE") return null;

    const parsed = JSON.parse(text);
    if (
      typeof parsed.title === "string" &&
      parsed.title.trim() &&
      typeof parsed.date === "string" &&
      !Number.isNaN(Date.parse(parsed.date))
    ) {
      return { title: parsed.title.trim(), date: parsed.date };
    }
    return null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: 타입 체크 + 린트**

```bash
cd "C:\Users\youja\Desktop\Neurocare"
npx tsc --noEmit -p tsconfig.json
npx eslint lib/calendar/detectCalendarIntent.ts
```

Expected: 둘 다 출력 없음.

- [ ] **Step 3: 실제 API로 라이브 검증**

`.env.local`에서 `UPSTAGE_API_KEY`를 읽어 3~4개 발화로 직접 호출해본다(스크래치패드에
임시 스크립트 작성, `readFileSync`로 `.env.local` 파싱 - 이번 세션에서 pro3/pro4
비교할 때 쓴 것과 같은 방식):

```javascript
// 스크래치패드에 compare-calendar-intent.mjs로 저장 후 실행
import { readFileSync } from "fs";
const envText = readFileSync("C:/Users/youja/Desktop/Neurocare/.env.local", "utf8");
const API_KEY = envText.match(/^UPSTAGE_API_KEY=["']?([^"'\n\r]+)["']?/m)?.[1];

const TEST_CASES = [
  "다음 주 화요일에 병원 가야해",
  "나 어제 손녀 만났잖아",
  "모레 저녁에 딸이 온다고 일정에 넣어줘",
  "오늘 날씨 어때?",
];

for (const text of TEST_CASES) {
  const today = new Date().toISOString().slice(0, 10);
  const res = await fetch("https://api.upstage.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "solar-pro4",
      messages: [
        { role: "system", content: `오늘 날짜는 ${today}입니다. ... (Step 1과 동일 프롬프트)` },
        { role: "user", content: text },
      ],
      temperature: 0,
      max_tokens: 100,
      reasoning_effort: "minimal",
    }),
  });
  const data = await res.json();
  console.log(`[${text}] ->`, data.choices?.[0]?.message?.content);
}
```

Expected: 병원/딸 방문 두 문장은 `{"title":..., "date":...}` JSON, 나머지 두 문장은
`NONE`. 날짜가 실제 다음 주 화요일/모레로 정확히 계산되는지 눈으로 확인.

- [ ] **Step 4: 커밋**

```bash
git add lib/calendar/detectCalendarIntent.ts
git commit -m "feat: 대화에서 일정 의도를 감지하는 LLM 호출 추가"
```

---

## Task 3: 캘린더 DB 연산 + 프롬프트 블록 빌더 (환자 앱)

**Files:**
- Create: `lib/calendar/calendarEvents.ts`
- Test: Task 5에서 API 라우트로 간접 검증(별도 유닛 테스트 없음 - 이 프로젝트 관례)

**Interfaces:**
- Consumes: `detectCalendarIntent` (Task 2), `isAffirmativeReply` from
  `@/lib/memory/photoContext`, `prisma` from `@/lib/db/prisma`
- Produces:
  - `handleCalendarTurn(patientId: string, latestUserText: string): Promise<{
    promptBlock: string; justConfirmed: boolean }>` - Task 4가 호출
  - `buildRecentCalendarEvents(patientId: string): Promise<string>` - Task 4가 호출

- [ ] **Step 1: 함수 작성**

```typescript
import { prisma } from "@/lib/db/prisma";
import { isAffirmativeReply } from "@/lib/memory/photoContext";
import { detectCalendarIntent } from "@/lib/calendar/detectCalendarIntent";

function formatDateLabel(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * 매 턴 항상 호출한다(chat/route.ts). 대기 중인 제안이 있으면 이번 발화가 확인인지
 * 판단하고, 없으면 이번 발화에서 새로 일정 의도를 찾는다. 프롬프트에 끼워 넣을
 * 블록 문자열과, "방금 확인돼서 저장까지 끝났는가"(응답 헤더로 클라이언트에 동기화
 * 트리거를 알려줄지 chat/route.ts가 판단하는 데 씀)를 함께 돌려준다.
 */
export async function handleCalendarTurn(
  patientId: string,
  latestUserText: string,
): Promise<{ promptBlock: string; justConfirmed: boolean }> {
  const pending = await prisma.pendingCalendarProposal.findUnique({ where: { patientId } });

  if (pending) {
    if (isAffirmativeReply(latestUserText)) {
      await prisma.$transaction([
        prisma.calendarEvent.create({
          data: {
            patientId,
            title: pending.title,
            date: pending.date,
            source: "patient_voice",
          },
        }),
        prisma.pendingCalendarProposal.delete({ where: { patientId } }),
      ]);
      return {
        promptBlock: `\n\n[방금 일정 추가함]\n"${pending.title}"을(를) ${formatDateLabel(pending.date)} 일정에 추가했다고 짧게 확인해주세요.`,
        justConfirmed: true,
      };
    }
    // 확인도 명백한 거부도 아니면(다른 화제로 넘어감 등) 대기 상태를 계속 유지한다 -
    // 다음 턴에 다시 판단한다. 명백히 무관한 대답이 계속 반복될 위험보다, 조용히
    // 사라지는 제안이 없는 쪽이 낫다(이미 확인을 한 번 물어봤으니 프롬프트에 다시
    // 안내하지 않으면 사용자는 잊혀졌다고 느낄 수 있어 계속 들고 있는다).
    return {
      promptBlock: `\n\n[확인 대기 중인 일정]\n"${pending.title}" (${formatDateLabel(pending.date)})을(를) 일정에 추가할지 아직 답을 못 들었습니다. 자연스러우면 다시 한번 짧게 확인해주세요.`,
      justConfirmed: false,
    };
  }

  const detected = await detectCalendarIntent(latestUserText);
  if (!detected) return { promptBlock: "", justConfirmed: false };

  const date = new Date(detected.date);
  await prisma.pendingCalendarProposal.upsert({
    where: { patientId },
    create: { patientId, title: detected.title, date },
    update: { title: detected.title, date, createdAt: new Date() },
  });

  return {
    promptBlock: `\n\n[제안할 일정]\n"${detected.title}"을(를) ${formatDateLabel(date)} 일정에 추가할지 자연스럽게 한 번 물어보세요(예: "${detected.title} 일정에 추가해드릴까요?"). 강요하지 마세요.`,
    justConfirmed: false,
  };
}

/**
 * 과거 60일 ~ 미래 14일 사이의 일정을 프롬프트에 항상 주입한다(buildUpcomingFamilyPlans와
 * 같은 패턴 - lib/memory/familyContext.ts 참고). LLM이 "그날 뭐였지" 같은 질문에
 * 관련 있을 때만 참고한다.
 */
export async function buildRecentCalendarEvents(patientId: string): Promise<string> {
  const now = new Date();
  const since = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const until = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const events = await prisma.calendarEvent.findMany({
    where: { patientId, date: { gte: since, lte: until } },
    orderBy: { date: "asc" },
    take: 30,
    select: { title: true, date: true, notes: true },
  });
  if (events.length === 0) return "";

  return events
    .map((e) => `- ${formatDateLabel(e.date)} ${e.title}${e.notes ? ` (${e.notes})` : ""}`)
    .join("\n");
}
```

- [ ] **Step 2: 타입 체크 + 린트**

```bash
cd "C:\Users\youja\Desktop\Neurocare"
npx tsc --noEmit -p tsconfig.json
npx eslint lib/calendar/calendarEvents.ts
```

Expected: 둘 다 출력 없음.

- [ ] **Step 3: 커밋**

```bash
git add lib/calendar/calendarEvents.ts
git commit -m "feat: 일정 제안/확인/저장 및 최근 일정 조회 로직 추가"
```

---

## Task 4: chat/route.ts에 캘린더 흐름 연결 (환자 앱)

**Files:**
- Modify: `app/api/chat/route.ts`

**Interfaces:**
- Consumes: `handleCalendarTurn`, `buildRecentCalendarEvents` (Task 3)
- Produces: 응답 헤더 `X-Calendar-Sync: 1` (justConfirmed일 때만) - Task 8의
  `llmStream.ts`가 이 헤더를 읽는다.

- [ ] **Step 1: import 추가**

`app/api/chat/route.ts` 상단, `import { buildWeatherContext } from "@/lib/weather";`
바로 아래에 추가:

```typescript
import { buildRecentCalendarEvents, handleCalendarTurn } from "@/lib/calendar/calendarEvents";
```

- [ ] **Step 2: SystemPromptResult에 justConfirmed 추가**

```typescript
interface SystemPromptResult {
  prompt: string;
  photo: PhotoToShow | null;
  /** 이번 턴에 방금 일정이 확인·저장됐으면 true - 클라이언트에 동기화를 트리거해야 한다. */
  calendarJustConfirmed: boolean;
}
```

- [ ] **Step 3: buildSystemPrompt 두 반환 지점에 캘린더 로직 연결**

`if (!patientId) return { prompt: ..., photo: null };` 줄을 찾아 교체:

```typescript
  if (!patientId) {
    return {
      prompt: SYSTEM_PROMPT_RULES + "\n" + SYSTEM_PROMPT_EXAMPLES + weatherBlock,
      photo: null,
      calendarJustConfirmed: false,
    };
  }
```

`Promise.all` 블록에 `handleCalendarTurn(patientId, latestUserText)`,
`buildRecentCalendarEvents(patientId)`를 추가(기존 6개 항목 뒤에 이어붙임):

```typescript
  const [
    roster,
    rawMemories,
    pendingMessages,
    upcomingPlans,
    unofferedPhotoPrompt,
    patientRecord,
    calendarTurn,
    recentCalendarEvents,
  ] = await Promise.all([
    buildFamilyRoster(patientId),
    latestUserText ? searchMemories(patientId, latestUserText, 3) : Promise.resolve([]),
    takePendingFamilyMessages(patientId),
    buildUpcomingFamilyPlans(patientId),
    getUnofferedPhotoPrompt(patientId),
    prisma.user.findUnique({ where: { id: patientId }, select: { dementiaStage: true } }),
    handleCalendarTurn(patientId, latestUserText),
    buildRecentCalendarEvents(patientId),
  ]);
```

- [ ] **Step 4: 프롬프트에 블록 추가 + 반환값에 calendarJustConfirmed 포함**

`if (upcomingPlans) { ... }` 블록 바로 다음에 추가:

```typescript
  if (recentCalendarEvents) {
    prompt += `

[등록된 일정]
과거 60일부터 앞으로 14일 사이에 등록된 일정입니다. "그날 뭐였지" 같은 질문에
관련 있을 때만 이 정보로 답하세요. 없는 내용을 지어내지 마세요.
${recentCalendarEvents}`;
  }

  prompt += calendarTurn.promptBlock;
```

이 두 블록은 기존의 `prompt += unofferedPhotoPrompt + weatherBlock;` 줄보다 **앞에**
와야 한다(그 줄은 그대로 둔다 - 안 지우고 안 옮긴다). 최종 순서: `...upcomingPlans
블록 → [신규] 등록된 일정 블록 → [신규] calendarTurn.promptBlock → 기존
unofferedPhotoPrompt+weatherBlock 줄 → return`.

마지막 `return { prompt, photo };` 줄을 교체:

```typescript
  return { prompt, photo, calendarJustConfirmed: calendarTurn.justConfirmed };
```

- [ ] **Step 5: POST 핸들러에서 헤더 세팅**

`const { prompt: systemPrompt, photo } = await buildSystemPrompt(...)` 줄을 교체:

```typescript
  const { prompt: systemPrompt, photo, calendarJustConfirmed } = await buildSystemPrompt(
    patientId,
    latestUserText,
    location,
  );
```

파일 맨 끝, `if (photo) { ... }` 블록 바로 다음에 추가:

```typescript
  if (calendarJustConfirmed) headers["X-Calendar-Sync"] = "1";
```

- [ ] **Step 6: 타입 체크 + 린트**

```bash
cd "C:\Users\youja\Desktop\Neurocare"
npx tsc --noEmit -p tsconfig.json
npx eslint app/api/chat/route.ts
```

Expected: 둘 다 출력 없음.

- [ ] **Step 7: 커밋**

```bash
git add app/api/chat/route.ts
git commit -m "feat: chat 라우트에 일정 제안/확인/조회 흐름 연결"
```

---

## Task 5: 동기화 대상 조회 + 완료 표시 API (환자 앱)

**Files:**
- Create: `app/api/calendar-events/unsynced/route.ts`
- Create: `app/api/calendar-events/[id]/synced/route.ts`

**Interfaces:**
- Consumes: `auth` from `@/lib/auth/authOptions`, `prisma`
- Produces: `GET /api/calendar-events/unsynced` → `{ events: { id, title, date }[] }`,
  `POST /api/calendar-events/:id/synced` → `{ ok: true }` - Task 7(네이티브 브릿지)이
  이 두 엔드포인트를 호출한다.

- [ ] **Step 1: unsynced 라우트 작성**

```typescript
import { auth } from "@/lib/auth/authOptions";
import { prisma } from "@/lib/db/prisma";

/**
 * GET /api/calendar-events/unsynced - 로그인한 환자 본인의, 아직 네이티브 캘린더에
 * 안 반영된 일정. MainActivity.kt가 앱 재개 시/일정 확인 직후 호출해 각각 네이티브
 * 삽입한 뒤 /synced로 완료 표시한다.
 */
export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "patient") {
    return Response.json({ error: "환자 계정만 조회할 수 있습니다." }, { status: 403 });
  }

  const events = await prisma.calendarEvent.findMany({
    where: { patientId: session.user.id, syncedToDeviceAt: null },
    select: { id: true, title: true, date: true },
    orderBy: { date: "asc" },
  });
  // date를 "YYYY-MM-DD"로 명시적으로 잘라서 보낸다 - Prisma Date를 그대로 JSON
  // 직렬화하면 전체 ISO 문자열(2026-08-15T00:00:00.000Z)이 되는데, 네이티브 쪽
  // (MainActivity.kt)이 SimpleDateFormat("yyyy-MM-dd")로 파싱하므로 형식을 맞춰야 한다.
  return Response.json({
    events: events.map((e) => ({ id: e.id, title: e.title, date: e.date.toISOString().slice(0, 10) })),
  });
}
```

- [ ] **Step 2: synced 라우트 작성**

```typescript
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth/authOptions";
import { prisma } from "@/lib/db/prisma";

/** POST /api/calendar-events/:id/synced - 네이티브 캘린더 삽입 완료 표시 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user?.role !== "patient") {
    return Response.json({ error: "환자 계정만 가능합니다." }, { status: 403 });
  }

  const { id } = await params;
  const event = await prisma.calendarEvent.findUnique({ where: { id } });
  if (!event || event.patientId !== session.user.id) {
    return Response.json({ error: "일정을 찾을 수 없습니다." }, { status: 404 });
  }

  await prisma.calendarEvent.update({ where: { id }, data: { syncedToDeviceAt: new Date() } });
  return Response.json({ ok: true });
}
```

- [ ] **Step 3: 타입 체크 + 린트**

```bash
cd "C:\Users\youja\Desktop\Neurocare"
npx tsc --noEmit -p tsconfig.json
npx eslint "app/api/calendar-events/unsynced/route.ts" "app/api/calendar-events/[id]/synced/route.ts"
```

Expected: 둘 다 출력 없음.

- [ ] **Step 4: 로컬 DB로 실제 동작 검증**

Task 1처럼 `.env.local`을 AUTH_SECRET만 남기고 격리한 뒤, dev 서버를 띄우고 로그인 후
`curl`로 확인(guardian/patient 테스트 계정은 `prisma/seed.ts`로 시딩된 것 재사용):

```bash
cd "C:\Users\youja\Desktop\Neurocare"
mv .env.local .env.local.bak
grep '^AUTH_SECRET=' .env.local.bak > .env.local
npm run dev &
# 몇 초 대기 후, Playwright나 curl+쿠키 저장으로 로그인한 세션에서
# GET /api/calendar-events/unsynced 호출 -> {"events":[]} 확인 (아직 아무것도 없으므로)
```

작업 후 반드시:
```bash
rm .env.local && mv .env.local.bak .env.local && wc -l .env.local
```

Expected: 빈 배열 응답, `.env.local` 원상복구(18줄).

- [ ] **Step 5: 커밋**

```bash
git add "app/api/calendar-events/unsynced/route.ts" "app/api/calendar-events/[id]/synced/route.ts"
git commit -m "feat: 캘린더 동기화 조회/완료 API 추가"
```

---

## Task 6: AndroidManifest에 WRITE_CALENDAR 권한 (환자 앱)

**Files:**
- Modify: `android/app/src/main/AndroidManifest.xml`

**Interfaces:**
- Produces: `WRITE_CALENDAR`, `READ_CALENDAR` 런타임 권한 선언 - Task 7이 요청한다.

- [ ] **Step 1: 권한 추가**

`<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />` 줄
바로 다음에 추가:

```xml
    <!-- 대화로 확인한 일정, 보호자가 웹에서 등록한 일정을 실제 휴대폰 캘린더에
         반영하기 위함. -->
    <uses-permission android:name="android.permission.READ_CALENDAR" />
    <uses-permission android:name="android.permission.WRITE_CALENDAR" />
```

- [ ] **Step 2: 매니페스트 유효성 확인**

```bash
cd "C:\Users\youja\Desktop\Neurocare\android"
./gradlew.bat processDebugMainManifest --offline
```

Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 3: 커밋**

```bash
cd "C:\Users\youja\Desktop\Neurocare"
git add android/app/src/main/AndroidManifest.xml
git commit -m "feat: 캘린더 읽기/쓰기 권한 추가"
```

---

## Task 7: 네이티브 브릿지 - 캘린더 삽입 + 동기화 트리거 (환자 앱)

**Files:**
- Modify: `android/app/src/main/java/com/neurocare/app/MainActivity.kt`

**Interfaces:**
- Consumes: `GET /api/calendar-events/unsynced`, `POST /api/calendar-events/:id/synced`
  (Task 5)
- Produces: `WebAppBridge.syncCalendarNow()` (JS에서 호출) - Task 8이 이걸 호출한다.
  내부적으로 `WRITE_CALENDAR` 권한을 요청·확인 후 `syncUnsyncedCalendarEvents()` 실행.

- [ ] **Step 1: import 추가**

파일 상단 import 블록에 추가:

```kotlin
import android.content.ContentValues
import android.provider.CalendarContract
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import okhttp3.Response
```

(`kotlinx.coroutines`가 build.gradle.kts에 없으면 Step 6에서 추가한다.)

- [ ] **Step 2: 권한 요청 목록에 캘린더 추가**

`ensurePermissionsThenStart()` 안의 `needed` 리스트를 교체:

```kotlin
    private fun ensurePermissionsThenStart() {
        val needed = mutableListOf(
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.ACCESS_COARSE_LOCATION,
            Manifest.permission.WRITE_CALENDAR,
            // getPrimaryCalendarId()가 캘린더 목록을 쿼리하므로 쓰기뿐 아니라 읽기도 필요하다.
            Manifest.permission.READ_CALENDAR,
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            needed += Manifest.permission.POST_NOTIFICATIONS
        }
```

- [ ] **Step 3: WebAppBridge에 syncCalendarNow 추가**

`WebAppBridge` 클래스 안, `setWakeWord` 메서드 다음에 추가:

```kotlin
        /**
         * 방금 대화에서 일정이 확인·저장되면(chat/route.ts의 X-Calendar-Sync 헤더)
         * 웹이 이걸 호출한다. onResume()에서도 같은 함수를 호출하므로 로직은
         * syncUnsyncedCalendarEvents() 하나로 통일한다.
         */
        @JavascriptInterface
        fun syncCalendarNow() {
            syncUnsyncedCalendarEvents()
        }
    }
```

- [ ] **Step 4: 동기화 함수 작성**

`private fun stopWakeWordService() { ... }` 다음에 추가:

```kotlin
    private val calendarHttpClient = OkHttpClient()

    /**
     * 서버(app/api/calendar-events/unsynced)에서 아직 네이티브 캘린더에 반영 안 된
     * 일정을 받아 각각 CalendarContract에 삽입하고, 완료된 것만 서버에 표시한다.
     * WRITE_CALENDAR 권한이 없으면 아무것도 안 하고 조용히 리턴한다 - 서버 DB에는
     * 이미 저장돼 있으므로 보호자 대시보드/대화 중 조회는 권한과 무관하게 정상 동작한다.
     */
    private fun syncUnsyncedCalendarEvents() {
        val hasCalendarPermissions = ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_CALENDAR) ==
            PackageManager.PERMISSION_GRANTED &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.READ_CALENDAR) ==
                PackageManager.PERMISSION_GRANTED
        if (!hasCalendarPermissions) return

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val listRequest = Request.Builder()
                    .url("${BuildConfig.WEBAPP_BASE_URL}/api/calendar-events/unsynced")
                    .build()
                val listResponse: Response = calendarHttpClient.newCall(listRequest).execute()
                val body = listResponse.body?.string().orEmpty()
                listResponse.close()
                if (!listResponse.isSuccessful || body.isBlank()) return@launch

                val events = JSONObject(body).getJSONArray("events")
                for (i in 0 until events.length()) {
                    val event = events.getJSONObject(i)
                    val id = event.getString("id")
                    val title = event.getString("title")
                    val isoDate = event.getString("date")
                    val inserted = insertIntoDeviceCalendar(title, isoDate)
                    if (inserted) markSyncedOnServer(id)
                }
            } catch (e: Exception) {
                Log.e(TAG, "캘린더 동기화 실패", e)
            }
        }
    }

    /** ContentResolver로 기본 캘린더에 하루짜리 일정을 삽입한다. 성공하면 true. */
    private fun insertIntoDeviceCalendar(title: String, isoDate: String): Boolean {
        return try {
            val calendarId = getPrimaryCalendarId() ?: return false
            val startMillis = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.KOREA)
                .parse(isoDate)?.time ?: return false
            val endMillis = startMillis + 24 * 60 * 60 * 1000

            val values = ContentValues().apply {
                put(CalendarContract.Events.CALENDAR_ID, calendarId)
                put(CalendarContract.Events.TITLE, title)
                put(CalendarContract.Events.DTSTART, startMillis)
                put(CalendarContract.Events.DTEND, endMillis)
                put(CalendarContract.Events.ALL_DAY, 1)
                put(CalendarContract.Events.EVENT_TIMEZONE, java.util.TimeZone.getDefault().id)
            }
            contentResolver.insert(CalendarContract.Events.CONTENT_URI, values) != null
        } catch (e: Exception) {
            Log.e(TAG, "네이티브 캘린더 삽입 실패: $title", e)
            false
        }
    }

    /** 기기의 기본(첫 번째) 캘린더 ID를 찾는다. 계정이 여러 개면 그중 첫 번째를 쓴다. */
    private fun getPrimaryCalendarId(): Long? {
        val projection = arrayOf(CalendarContract.Calendars._ID)
        contentResolver.query(CalendarContract.Calendars.CONTENT_URI, projection, null, null, null)
            ?.use { cursor ->
                if (cursor.moveToFirst()) return cursor.getLong(0)
            }
        return null
    }

    private fun markSyncedOnServer(eventId: String) {
        try {
            val request = Request.Builder()
                .url("${BuildConfig.WEBAPP_BASE_URL}/api/calendar-events/$eventId/synced")
                .post("".toRequestBody(null))
                .build()
            calendarHttpClient.newCall(request).execute().close()
        } catch (e: Exception) {
            Log.e(TAG, "동기화 완료 표시 실패: $eventId", e)
        }
    }
```

(`"".toRequestBody(null)`을 쓰려면 `import okhttp3.RequestBody.Companion.toRequestBody`가
이미 파일에 있는지 확인 - 기존 `reportToServer`에서 이미 import돼 있음.)

- [ ] **Step 5: onResume에서 호출**

`override fun onResume() { ... }` 안, `stopWakeWordService()` 호출 다음 줄에 추가:

```kotlin
        syncUnsyncedCalendarEvents()
```

- [ ] **Step 6: coroutines 의존성 확인**

```bash
grep -n "kotlinx-coroutines" "C:\Users\youja\Desktop\Neurocare\android\app\build.gradle.kts"
```

없으면 `dependencies { ... }` 블록에 추가:

```kotlin
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
```

- [ ] **Step 7: 컴파일 확인**

```bash
cd "C:\Users\youja\Desktop\Neurocare\android"
./gradlew.bat compileDebugKotlin --offline
```

Expected: `BUILD SUCCESSFUL`. 실패하면 import 누락/타입 오류부터 확인.

- [ ] **Step 8: 커밋**

```bash
cd "C:\Users\youja\Desktop\Neurocare"
git add android/app/src/main/java/com/neurocare/app/MainActivity.kt android/app/build.gradle.kts
git commit -m "feat: 네이티브 캘린더 동기화 브릿지 추가"
```

---

## Task 8: 웹에서 동기화 신호 받으면 네이티브 호출 (환자 앱)

**Files:**
- Modify: `lib/llmStream.ts`
- Modify: `hooks/useConversationEngine.ts`

**Interfaces:**
- Consumes: 응답 헤더 `X-Calendar-Sync`(Task 4), `window.Android.syncCalendarNow()`(Task 7)
- Produces: `StreamChatOptions.onCalendarSync?: () => void` 콜백

- [ ] **Step 1: llmStream.ts에 콜백 추가**

`StreamChatOptions` 인터페이스에 추가(`location` 필드 다음):

```typescript
  /** 서버가 방금 일정을 확인·저장했으면(X-Calendar-Sync 헤더) 호출된다. */
  onCalendarSync?: () => void;
```

`photoUrl` 헤더를 읽는 블록 다음에 추가:

```typescript
  if (response.headers.get("X-Calendar-Sync")) {
    options.onCalendarSync?.();
  }
```

- [ ] **Step 2: useConversationEngine.ts에서 브릿지 호출**

`streamChat(history, { ... })` 호출부에 추가(`onPhoto` 다음):

```typescript
          onCalendarSync: () => {
            (window as unknown as { Android?: { syncCalendarNow?: () => void } }).Android?.syncCalendarNow?.();
          },
```

- [ ] **Step 3: 타입 체크 + 린트**

```bash
cd "C:\Users\youja\Desktop\Neurocare"
npx tsc --noEmit -p tsconfig.json
npx eslint lib/llmStream.ts hooks/useConversationEngine.ts
```

Expected: 둘 다 출력 없음.

- [ ] **Step 4: 커밋**

```bash
git add lib/llmStream.ts hooks/useConversationEngine.ts
git commit -m "feat: 일정 확인 시 네이티브 캘린더 동기화 트리거"
```

---

## Task 9: 보호자 앱 - CalendarEvent 스키마 이식 (Neurocare_care)

**Files:**
- Modify: `C:\Users\youja\Desktop\Neurocare_care_work\prisma\schema.prisma`

**Interfaces:**
- Produces: 환자 앱과 동일한 `CalendarEvent` 타입(Prisma Client) - Task 10이 쓴다.

- [ ] **Step 1: 최신 상태로 pull**

```bash
cd "C:\Users\youja\Desktop\Neurocare_care_work"
git pull origin main
```

- [ ] **Step 2: 스키마에 모델 추가**

`model FamilyPlan { ... }` 블록(dementiaStage 이식 때와 같은 위치 확인 방식) 다음에
Task 1의 `CalendarEvent` 모델을 **그대로** 추가한다(PendingCalendarProposal은 보호자
앱에서 안 씀 - 확인 흐름은 환자 음성 전용).

`model User { ... }`에 역관계 추가:

```prisma
  calendarEvents CalendarEvent[]
```

새 마이그레이션은 만들지 않는다(Global Constraints 참고 - 환자 앱 쪽 마이그레이션이
이미 같은 DB에 테이블을 만든다).

- [ ] **Step 3: Prisma Client 재생성 + 타입 체크**

```bash
npx prisma generate
npx tsc --noEmit -p tsconfig.json
```

Expected: 둘 다 에러 없음.

- [ ] **Step 4: 커밋**

```bash
git add prisma/schema.prisma
git commit -m "feat: CalendarEvent 모델 필드 선언 이식 (환자 앱과 DB 공유)"
```

---

## Task 10: 보호자 앱 - 일정 API (Neurocare_care)

**Files:**
- Create: `app/api/guardian/calendar-events/route.ts`
- Create: `app/api/guardian/calendar-events/[id]/route.ts`

**Interfaces:**
- Consumes: `requireGuardianAccess`, `requirePatientAccess`, `authErrorResponse` from
  `@/lib/auth/permissions` (기존 `app/api/guardian/plans/route.ts` 패턴 그대로)
- Produces: `GET/POST /api/guardian/calendar-events`, `DELETE
  /api/guardian/calendar-events/:id` - Task 11의 `CalendarEventList.tsx`가 호출.

- [ ] **Step 1: GET/POST 라우트 작성**

`app/api/guardian/plans/route.ts`를 그대로 참고해서 작성(모델명/필드만 교체):

```typescript
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { authErrorResponse, requireGuardianAccess, requirePatientAccess } from "@/lib/auth/permissions";

interface CalendarEventInput {
  patientId?: string;
  title?: string;
  date?: string;
  notes?: string | null;
}

function validate(body: CalendarEventInput) {
  if (!body.patientId || !body.title?.trim() || !body.date) {
    throw new Error("환자, 일정 제목, 날짜는 필수입니다.");
  }
}

/** GET /api/guardian/calendar-events?patientId=... - 날짜순 일정 목록 */
export async function GET(request: NextRequest) {
  try {
    const patientId = request.nextUrl.searchParams.get("patientId") ?? "";
    if (!patientId) return Response.json({ error: "patientId가 필요합니다." }, { status: 400 });
    await requirePatientAccess(patientId);

    const events = await prisma.calendarEvent.findMany({
      where: { patientId },
      orderBy: { date: "asc" },
    });
    return Response.json({ events });
  } catch (err) {
    return authErrorResponse(err) ?? Response.json({ error: "조회 실패" }, { status: 500 });
  }
}

/** POST /api/guardian/calendar-events - 일정 등록 (보호자만, 확인 절차 없이 바로 저장) */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CalendarEventInput;
    validate(body);
    const session = await requireGuardianAccess(body.patientId!);

    const event = await prisma.calendarEvent.create({
      data: {
        patientId: body.patientId!,
        title: body.title!.trim(),
        date: new Date(body.date!),
        notes: body.notes?.trim() || null,
        source: "guardian_web",
        addedBy: session.user.id,
      },
    });
    return Response.json({ event }, { status: 201 });
  } catch (err) {
    const authResponse = authErrorResponse(err);
    if (authResponse) return authResponse;
    const message = err instanceof Error ? err.message : "등록 실패";
    return Response.json({ error: message }, { status: 400 });
  }
}
```

- [ ] **Step 2: DELETE 라우트 작성**

`app/api/guardian/plans/[id]/route.ts`의 `DELETE`만 참고해서 작성:

```typescript
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { authErrorResponse, requireGuardianAccess } from "@/lib/auth/permissions";

/** DELETE /api/guardian/calendar-events/:id (보호자만) */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const existing = await prisma.calendarEvent.findUnique({ where: { id } });
    if (!existing) return Response.json({ error: "일정을 찾을 수 없습니다." }, { status: 404 });
    await requireGuardianAccess(existing.patientId);

    await prisma.calendarEvent.delete({ where: { id } });
    return Response.json({ deleted: true });
  } catch (err) {
    return authErrorResponse(err) ?? Response.json({ error: "삭제 실패" }, { status: 500 });
  }
}
```

- [ ] **Step 3: 타입 체크 + 린트**

```bash
cd "C:\Users\youja\Desktop\Neurocare_care_work"
npx tsc --noEmit -p tsconfig.json
npx eslint "app/api/guardian/calendar-events/route.ts" "app/api/guardian/calendar-events/[id]/route.ts"
```

Expected: 둘 다 출력 없음.

- [ ] **Step 4: 커밋**

```bash
git add "app/api/guardian/calendar-events/route.ts" "app/api/guardian/calendar-events/[id]/route.ts"
git commit -m "feat: 보호자용 일정 등록/조회/삭제 API 추가"
```

---

## Task 11: 보호자 앱 - 대시보드 UI (Neurocare_care)

**Files:**
- Create: `components/guardian/CalendarEventList.tsx`
- Modify: `app/(guardian)/page.tsx`

**Interfaces:**
- Consumes: `GET/POST /api/guardian/calendar-events`, `DELETE
  /api/guardian/calendar-events/:id` (Task 10)
- Produces: `<CalendarEventList patientId={string} />` - 홈 페이지에 렌더링.

- [ ] **Step 1: 컴포넌트 작성**

`components/guardian/FamilyPlanList.tsx`를 참고해서 작성(모델/필드/엔드포인트만 교체,
`source`로 작은 배지 표시 추가):

```typescript
"use client";

import { useEffect, useState } from "react";
import type { CalendarEvent } from "@prisma/client";

function toDateInput(value: Date | string) {
  return new Date(value).toISOString().slice(0, 10);
}

/** 환자가 대화로 확인해 추가했거나(source=patient_voice) 보호자가 직접 등록한
 * (source=guardian_web) 일정. 등록하면 환자 휴대폰의 네이티브 캘린더에도 반영된다
 * (앱 재개 시 자동 동기화, android/app/.../MainActivity.kt 참고). */
export function CalendarEventList({ patientId }: { patientId: string }) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const response = await fetch(`/api/guardian/calendar-events?patientId=${patientId}`);
        const data = await response.json();
        if (!cancelled) setEvents(data.events ?? []);
      } catch {
        if (!cancelled) setError("일정을 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/guardian/calendar-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, title, date, notes: notes || null }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "등록에 실패했습니다.");
        return;
      }
      setEvents((prev) => [...prev, data.event].sort((a, b) => a.date.localeCompare(b.date)));
      setTitle("");
      setDate("");
      setNotes("");
    } catch {
      setError("등록에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    await fetch(`/api/guardian/calendar-events/${id}`, { method: "DELETE" }).catch(() => {});
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-surface-border bg-surface p-5">
      <h3 className="font-semibold">일정</h3>
      <p className="text-sm text-muted-foreground">
        여기서 등록하거나 환자분이 대화로 확인한 일정이 휴대폰 캘린더에도 자동으로 반영됩니다.
      </p>

      <form onSubmit={handleAdd} className="flex flex-col gap-2 sm:flex-row">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="일정 (예: 병원 진료)"
          required
          className="flex-1 rounded-xl border border-surface-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
          className="rounded-xl border border-surface-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="메모 (선택)"
          className="rounded-xl border border-surface-border bg-background px-3 py-2 text-sm outline-none focus:border-accent sm:w-40"
        />
        <button
          type="submit"
          disabled={submitting}
          className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition hover:-translate-y-0.5 hover:shadow-md hover:brightness-110 disabled:opacity-50"
        >
          등록
        </button>
      </form>

      {error && <p className="text-sm text-danger-foreground">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted-foreground">불러오는 중...</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-muted-foreground">등록된 일정이 없습니다.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {events.map((event) => (
            <li
              key={event.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-surface-border bg-background px-3 py-2 text-sm"
            >
              <div>
                <p>
                  <span className="font-medium">{toDateInput(event.date)}</span> {event.title}
                  {event.notes && <span className="text-muted-foreground"> ({event.notes})</span>}
                  <span className="ml-2 rounded-full bg-surface-border px-2 py-0.5 text-xs text-muted-foreground">
                    {event.source === "patient_voice" ? "환자가 추가함" : "보호자가 추가함"}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(event.id)}
                className="shrink-0 text-xs text-muted-foreground hover:text-danger-foreground"
              >
                삭제
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 2: 홈 페이지에 연결**

`app/(guardian)/page.tsx` 상단 import에 추가:

```typescript
import { CalendarEventList } from "@/components/guardian/CalendarEventList";
```

`<ConversationHistorySection key={selectedId} patientId={selectedId} />` 바로 위에 추가:

```typescript
          <CalendarEventList key={selectedId} patientId={selectedId} />
```

- [ ] **Step 3: 타입 체크 + 린트**

```bash
cd "C:\Users\youja\Desktop\Neurocare_care_work"
npx tsc --noEmit -p tsconfig.json
npx eslint components/guardian/CalendarEventList.tsx "app/(guardian)/page.tsx"
```

Expected: 둘 다 출력 없음.

- [ ] **Step 4: 로컬 격리 DB로 화면 확인**

이번 세션에서 반복한 방식 그대로 - `.env.local`을 AUTH_SECRET만 남기고 격리,
`prisma db push`로 로컬 dev.db에 새 테이블 반영, playwright(또는 브라우저)로
`guardian@test.local` 로그인 후 홈 화면에서 "일정" 섹션이 보이는지, 등록 폼으로
하나 추가해보고 목록에 뜨는지 확인. 작업 후 `.env.local` 원상복구, playwright
devDependency 제거(이번 세션에서 반복한 정리 루틴).

- [ ] **Step 5: 커밋**

```bash
git add components/guardian/CalendarEventList.tsx "app/(guardian)/page.tsx"
git commit -m "feat: 보호자 홈 화면에 일정 섹션 추가"
```

---

## 최종 확인 (두 저장소 다 푸시 전)

- [ ] **환자 앱**: `git push origin neurocare && git push origin neurocare:main`
- [ ] **보호자 앱**: `git push origin main`
- [ ] 사용자에게 안내: 두 앱 다 네이티브(Kotlin) 변경이 있어 APK 재빌드+재설치
  필요. 실기기에서 "일정 추가해줘" 음성 확인 → 앱 재개 시 휴대폰 캘린더에 실제로
  뜨는지, 보호자 웹에서 추가한 일정도 동기화되는지 직접 확인 필요(Tavily 키
  검증과 마찬가지로 라이브 기기 테스트는 이 세션에서 대신 못 함).
