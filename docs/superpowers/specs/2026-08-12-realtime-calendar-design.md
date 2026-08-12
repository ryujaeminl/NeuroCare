# Realtime 음성 경로에 캘린더 연동 (Stage 2-1)

## 배경

기존 텍스트 챗 경로(`app/api/chat/route.ts`)는 매 턴 `handleCalendarTurn()`/
`buildRecentCalendarEvents()`를 호출해 일정 제안→확인→저장과 일정 조회를 처리한다.
Realtime 음성 경로(`hooks/useRealtimeConversation.ts`, `app/api/realtime/token/route.ts`,
`docs/superpowers/specs/2026-08-12-realtime-voice-pipeline-design.md`)는 세션 시작
시점에 `instructions`를 한 번 고정하는 구조라 매 턴 서버 프롬프트를 갱신할 수 없고,
그 스펙에서도 캘린더는 명시적으로 범위 밖("함수 호출 방식으로 다시 짜야 하는 별도
서브프로젝트")으로 미뤄뒀다. 이 스펙이 그 서브프로젝트다.

작업 중 발견: `token/route.ts`/`useRealtimeConversation.ts`에 이미 커밋 안 된
`web_search` function-calling 툴이 추가돼 있었다(별도 작업, 이 스펙과 무관). 이
스펙은 그 툴과 같은 배관(`response.function_call_arguments.done` 이벤트 처리,
`function_call_output` 응답)을 캘린더 등록에도 그대로 재사용한다.

## 목표 / 범위

- 음성 대화 중 "내일 뭐 있지", "지난주 병원 갔었지" 같은 질문에 실제 등록된 일정으로
  답할 수 있다 (조회)
- 음성으로 일정을 언급하면 모델이 자연스럽게 확인을 물어보고, 사용자가 동의하면
  실제로 DB에 저장되고 휴대폰 네이티브 캘린더에도 동기화된다 (등록)

## 범위 밖

- 일정 수정/삭제는 음성 경로에서 다루지 않음(보호자 웹에서만 가능, 기존 그대로)
- `PendingCalendarProposal` 테이블/텍스트챗의 turn-by-turn 의도감지(Upstage 호출)는
  Realtime 경로에서 쓰지 않음 — 아래 아키텍처 참고

## 아키텍처

```
[세션 시작] GET /api/realtime/token
    │ (기존 가족관계 주입과 같은 자리에) buildRecentCalendarEvents(patientId) → instructions에 주입
    │ session.tools에 add_calendar_event 함수 정의 추가
    ▼
[대화 중] 사용자가 일정 언급
    │ 모델이 instructions 규칙에 따라 자연스럽게 확인 질문
    │ 사용자가 동의
    ▼
모델이 add_calendar_event({title, date}) 호출
    │ (data channel: response.function_call_arguments.done, name="add_calendar_event")
    ▼
클라이언트: POST /api/realtime/calendar-event { title, date }
    │ 실패 시 1회 재시도(짧은 대기 후)
    ├─ 성공 → window.Android?.syncCalendarNow?.() 호출 (기존 네이티브 브릿지 재사용)
    │         function_call_output: 저장 완료 메시지
    └─ 재시도까지 실패 → function_call_output: 저장 실패 메시지
    ▼
dataChannel.send(function_call_output) + response.create
    → 모델이 결과를 자연스럽게 음성으로 알림("추가했어요" / "죄송해요 지금 안 됐어요")
```

핵심 설계 결정: 텍스트챗의 `handleCalendarTurn()`은 별도 LLM 호출(Upstage)로 의도를
감지하고 pending 상태를 DB에 들고 있다가 다음 턴 확인/거부를 판단한다. Realtime은
이미 대화형 모델이 세션을 열고 있으므로, 같은 판단(의도 감지 + 확인 질문 + 동의 여부)을
**모델 자신에게 맡기고** 모델이 확신했을 때만 tool을 호출하게 한다. 별도 LLM 호출도,
pending 테이블도 필요 없다 — tool 호출 자체가 "확인 완료"를 의미하므로 서버는 바로
`CalendarEvent`를 생성한다.

### 컴포넌트

- **`app/api/realtime/token/route.ts`** (수정): `buildFamilyRoster`를 부르는 자리
  옆에 `buildRecentCalendarEvents(patientId)`도 병렬 호출, instructions에
  `[등록된 일정]` 블록 추가(텍스트챗과 동일 문구 재사용 - `lib/calendar/calendarEvents.ts`
  export 그대로 씀). `session.tools`에 아래 함수 정의 추가:
  ```json
  {
    "type": "function",
    "name": "add_calendar_event",
    "description": "환자가 언급한 일정을 사용자가 명확히 동의했을 때만 호출해 등록합니다.",
    "parameters": {
      "type": "object",
      "properties": {
        "title": { "type": "string", "description": "일정 제목" },
        "date": { "type": "string", "description": "YYYY-MM-DD" }
      },
      "required": ["title", "date"]
    }
  }
  ```
  instructions에 "일정을 언급하면 자연스럽게 물어보고, 명확히 동의했을 때만
  add_calendar_event를 호출하세요. 강요하지 마세요." 규칙 한 줄 추가(텍스트챗
  `handleCalendarTurn`의 제안 문구 톤과 동일).
- **`app/api/realtime/calendar-event/route.ts`** (신규): `POST { title, date }`,
  `app/api/realtime/distress-check/route.ts`와 동일한 인증 패턴(`auth()`,
  `role === "patient"`). 유효성 검사(title 비어있지 않음, date가 유효한 날짜) 후
  `prisma.calendarEvent.create({ patientId, title, date: new Date(date), source:
  "patient_voice" })`. 응답: `{ ok: true }` 또는 `{ error: string }` (400/401/500).
- **`hooks/useRealtimeConversation.ts`** (수정): data channel 메시지 핸들러에
  `e.type === "response.function_call_arguments.done" && e.name ===
  "add_calendar_event"` 분기 추가(기존 `web_search` 분기와 나란히, 같은 파싱 패턴).
  `/api/realtime/calendar-event`에 POST, 실패 시 1회 재시도. 성공하면
  `window.Android?.syncCalendarNow?.()` 호출(타입은 기존 `Window.Android` 선언에
  `syncCalendarNow?: () => void` 필드 추가 필요). 결과를 `function_call_output`으로
  돌려주고 `response.create` 전송.

## 에러 처리

- `/api/realtime/calendar-event` 실패(네트워크/DB) → 클라이언트가 1회 재시도. 그래도
  실패하면 `function_call_output`에 실패 메시지를 담아 모델에 전달 — 모델이 대화로
  자연스럽게 재시도를 유도("죄송해요, 다시 한번 말씀해주시겠어요"). 별도 UI 알림 없음.
- `buildRecentCalendarEvents` 실패(DB 에러) → `token/route.ts`의 기존 `Promise.all`
  실패 처리 방식을 따름(현재 가족 roster도 동일 취급 - 이 라우트 자체가 500으로
  실패하면 세션이 아예 안 열림. 이 스펙에서 별도 방어 로직 추가하지 않음, 기존과
  동일한 신뢰 수준).
- 모델이 잘못된 date 형식으로 tool을 호출 → 서버 라우트에서 `Date.parse` 검증 후
  400 반환, `function_call_output`으로 실패를 알려 모델이 다시 물어보게 함.

## 테스트 계획

- `app/api/realtime/calendar-event/route.ts`: `npx tsc --noEmit`, `npx eslint` — 이
  저장소엔 테스트 러너가 없어 타입체크/린트 + 수동 curl 검증(로그인 세션 쿠키로
  POST, DB에 실제 row 생기는지 확인)으로 대체(기존 관례 그대로).
- 실기기 검증(핵심 리스크): 음성으로 "다음 주 화요일에 병원 가야해" → 모델이
  확인 질문 → "응" 대답 → 실제 DB 저장 + 앱 재개 시 네이티브 캘린더에 반영되는지.
  이후 "다음 주 화요일에 뭐 있지" 질문에 실제 등록된 일정으로 답하는지.
