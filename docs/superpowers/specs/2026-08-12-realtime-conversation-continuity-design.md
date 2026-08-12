# Realtime 음성 경로에 대화 저장 + 전날 대화 이어가기 (Stage 2-2)

## 배경

텍스트 챗 경로는 `hooks/useConversationPersistence.ts`로 매 턴을 `/api/sessions`,
`/api/turns`에 저장하고(같은 날짜면 세션을 이어 씀, `POST /api/sessions`의
`(patientId, dateKey)` upsert), `/api/turns`가 저장과 동시에 Pinecone에도 색인한다.
`app/api/chat/route.ts`는 매 턴 `searchMemories()`로 지금 발화와 의미적으로 가까운
과거 기억을 검색해 프롬프트에 넣는다.

Realtime 음성 경로(`hooks/useRealtimeConversation.ts`)는 전사·응답을 화면 `log`
state에만 넣고 서버에 저장하지 않는다. 세션 시작 시(`app/api/realtime/token/route.ts`)
과거 대화나 기억을 instructions에 넣는 코드도 없다. Stage 2-1(캘린더,
`docs/superpowers/specs/2026-08-12-realtime-calendar-design.md`)과 같은 이유로
범위 밖으로 미뤄뒀던 부분이다.

## 목표 / 범위

- 음성 대화도 텍스트챗과 동일하게 서버에 저장된다(`ConversationSession`/`Turn`,
  Pinecone 색인 포함) — 보호자 대시보드의 기분 분석/대화 기록 조회가 음성 대화에도
  그대로 동작하게 한다.
- 새 세션 시작 시, 오늘이 아닌 가장 최근 대화 세션의 마지막 몇 턴을 instructions에
  넣어 모델이 "어제 무슨 얘기 했었지" 맥락을 참고할 수 있게 한다.

## 범위 밖

- 매 턴 Pinecone 유사 기억 검색(`searchMemories`)은 이번에 안 넣는다 — 지금 발화와
  의미적으로 가까운 과거 아무 대화나 찾는 기능이라, Realtime에 넣으려면 별도
  function-calling tool 설계(언제 호출할지 프롬프트 튜닝 포함)가 필요한 별도
  범위. 세션 시작 시 "직전 세션 이어가기"까지만 다룬다.
- 기분 분석(`/api/mood`) 트리거는 `useConversationPersistence` 내부 로직을 그대로
  가져다 쓰므로 자동으로 따라온다 - 별도 작업 아님.

## 아키텍처

```
[세션 시작] GET /api/realtime/token
    │ (기존 가족관계/캘린더 주입과 같은 자리에) buildPreviousSessionContext(patientId)
    │ → instructions에 "[전날 대화]" 블록 주입
    ▼
[대화 중] 매 턴 전사/응답 완료
    │ useConversationPersistence.saveTurn(role, text) 호출
    │ (내부에서 /api/sessions 세션 확보 → /api/turns 저장 → Pinecone 색인)
    ▼
[대화 종료] 탭 닫힘/언마운트
    │ useConversationPersistence 내부 pagehide 리스너가 /api/mood(final)로 세션 마무리
    (이 부분은 훅을 그대로 가져다 쓰므로 새 코드 없음)
```

핵심 설계 결정: `useConversationPersistence`는 이미 role/text만 받는 순수 부수효과
훅이라 텍스트챗 전용 코드가 없다 - Realtime 훅에 그대로 재사용한다. 새로 만드는
코드는 (1) 두 이벤트 핸들러에서 `saveTurn` 호출 두 줄, (2) "전날 대화" 조회·포맷
함수 하나뿐이다.

### 컴포넌트

- **`lib/memory/previousSession.ts`** (신규): `buildPreviousSessionContext(patientId:
  string): Promise<string>`. 오늘(KST) 아닌 가장 최근 `ConversationSession`을
  `dateKey` 기준으로 찾고(`prisma.conversationSession.findFirst({ where: {
  patientId, dateKey: { not: todayKey } }, orderBy: { startedAt: "desc" } })`),
  그 세션의 마지막 10개 `Turn`을 시간순으로 가져와 포맷한다. 세션이 없거나 턴이
  0개면 빈 문자열(호출부가 `if (block)`로 건너뜀 - 캘린더 블록과 동일 패턴).
  KST 날짜 키 계산은 `app/api/sessions/route.ts`의 `todayKeyKst()`와 동일한 3줄
  로직을 그대로 인라인한다(둘 다 짧고, 공유 유틸로 뽑을 만큼 반복이 크지 않음 -
  `lib/calendar/calendarEvents.ts`의 `formatDateLabel`도 같은 이유로 로컬 함수).
- **`app/api/realtime/token/route.ts`** (수정): 기존 `Promise.all`에
  `buildPreviousSessionContext(patientId)` 추가, instructions에
  `[전날 대화]` 블록 주입(가족관계/캘린더 블록과 같은 자리, 같은 패턴).
- **`hooks/useRealtimeConversation.ts`** (수정): `useConversationPersistence(true)`
  호출 후, `response.output_audio_transcript.done`에서
  `persistence.saveTurn("assistant", transcript)`,
  `conversation.item.input_audio_transcription.completed`에서
  `persistence.saveTurn("user", transcript)` 호출 추가. `enabled` 인자는 페이지에서
  안 받고 훅 내부에서 `true` 고정 - 서버 쪽 `/api/sessions`, `/api/turns`가 이미
  `requirePatientSelf()`로 막고 있어(기존 `/api/realtime/token`도 클라이언트에서
  role을 안 가리고 서버 인증에만 의존하는 동일 패턴), 보호자 세션이면 호출이 조용히
  401로 실패할 뿐 대화 자체엔 영향 없다.

## 에러 처리

- `buildPreviousSessionContext` 실패(DB 에러) → `token/route.ts`의 `Promise.all`
  실패 처리를 그대로 따름(가족 roster/캘린더 조회와 동일한 신뢰 수준 - 이 라우트가
  이미 그렇게 동작 중이므로 이 스펙에서 별도 방어 로직을 추가하지 않는다).
- `saveTurn` 실패(네트워크/DB) → 이미 `useConversationPersistence` 내부에서
  try/catch로 삼켜져 대화 흐름에 영향 없음(기존 동작, 이 스펙에서 변경 없음).

## 테스트 계획

- `lib/memory/previousSession.ts`: `npx tsc --noEmit`, `npx eslint` — 이 저장소엔
  테스트 러너가 없어 타입체크/린트 + 로컬 dev.db에 테스트 세션/턴을 만들어 직접
  호출 결과를 확인하는 수동 검증으로 대체(기존 관례).
- 실기기 검증(핵심 리스크): 하루 대화 후 앱을 완전히 종료했다가 다음날(또는
  `dateKey`를 과거로 수동 세팅한 테스트 세션으로) 다시 열어, 음성 세션이
  전날 얘기를 자연스럽게 참고하는지, 그리고 `/history`(보호자 대화 기록 조회
  화면)에 음성 대화 턴이 실제로 쌓이는지 확인.
