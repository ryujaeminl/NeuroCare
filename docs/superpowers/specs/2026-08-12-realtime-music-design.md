# Realtime 음성 경로 음악 재생 + 취향 추천 설계

## 배경

이전에 텍스트챗(`app/api/chat/route.ts`) 기준으로 유튜브 노래 재생 기능을 설계한
적이 있다(`docs/superpowers/specs/2026-08-12-youtube-music-design.md`) — 구현은
안 됐고, 재생 이력 저장도 명시적으로 범위 밖이었다. 지금 실제 홈 화면
(`app/page.tsx`)은 그 사이 Realtime WebRTC 음성 경로(`useRealtimeConversation.ts`)로
완전히 넘어갔고, 캘린더(`add_calendar_event`)·웹검색(`web_search`) 둘 다 Realtime의
자체 function-calling 툴로 구현된 선례가 있다. 이 스펙은 그 패턴을 따라 음악
재생을 Realtime 경로에 새로 설계하고, 여기에 "재생 이력 저장 + 취향 기반 추천"을
더한다.

## 목표 / 범위

- 환자가 음성으로 노래를 요청하면(곡명 지정 또는 "노래 틀어줘") 모델이 자연스럽게
  확인 후 유튜브에서 검색해 화면에 오버레이로 재생한다.
- 재생된 곡의 제목을 서버에 기록한다.
- 새 세션 시작 시 최근 재생 목록을 모델에게 넘겨, "그날 뭐였지"·"등록된 일정"과
  같은 패턴으로 모델이 스스로 취향을 참고해 곡을 제안할 수 있게 한다(장르/가수
  구조화 집계 없음 - 원문 제목 목록 그대로 넘기고 모델의 추론에 맡긴다).

## 범위 밖

- 재생목록/큐 관리 — 한 번에 한 곡만.
- 보호자 앱에서의 원격 제어 — 환자 앱 전용.
- 네이티브 안드로이드 코드 변경 — 기존 WebView 안에서 웹 기술로 해결.
- 가수/장르 구조화 집계("트로트×5" 같은 통계) — 곡 제목 원문을 그대로 모델에게
  넘기고 모델이 텍스트에서 직접 취향을 추론하게 한다. 재생마다 별도 LLM 호출로
  메타데이터를 뽑는 건 비용 대비 이득이 낮다고 판단해 뺐다.
- 재생 중 마이크 에코 캔슬링 — Realtime은 서버사이드(Azure) VAD를 쓰기 때문에
  구 파이프라인의 `useBargeIn.ts`(`isSpeaking` 임계값 조정) 방식을 그대로 가져올
  수 없다. 이번 스펙에서 새 에코 캔슬링 로직은 만들지 않고, 오버레이의 수동 X
  버튼을 최종 안전장치로 둔다(알려진 리스크로 명시, 아래 에러 처리 참고).

## 아키텍처

```
[세션 시작] GET /api/realtime/token
    │ buildRecentPlaysContext(patientId) → instructions에 "[최근 들은 노래]" 블록 주입
    │ session.tools에 play_song({query}), stop_song({}) 추가
    ▼
[대화 중] 사용자가 노래 요청
    │ 모델이 자연스럽게 확인 질문(곡 미지정 시 추천 포함) → 동의 시 play_song 호출
    ▼
클라이언트: POST /api/music/search {query}
    │ yt-search로 상위 1개 결과
    ├─ 찾음 → MusicOverlay에 videoId 표시 + POST /api/music/history로 재생 기록
    │         function_call_output: 재생 시작 알림
    └─ 못 찾음 → function_call_output: "그 노래를 못 찾았다" 메시지(오버레이 안 띄움)
    ▼
[정지] 사용자가 "그만"/"다른 곡" 요청
    │ stop_song 호출 → 오버레이 언마운트 (다른 곡이면 모델이 곧이어 play_song 재호출)
```

핵심 설계 결정: 캘린더 등록과 동일하게 "제안→확인→호출"을 전부 모델 자신에게
맡긴다. 별도 의도감지 LLM 호출이나 서버측 상태(`PendingCalendarProposal` 같은
테이블)가 필요 없다 — `play_song` 호출 자체가 "사용자 동의 완료"를 의미한다.

### 컴포넌트

- **Prisma `PlayedSong`** (신규 모델): `{ id, patientId, title, videoId, playedAt }`.
  재생 이력. 보호자 조회 UI는 이번 스펙에 없음(순수 취향 컨텍스트 소스).
- **`app/api/music/search/route.ts`** (신규): `POST { query: string }` →
  `yt-search`로 검색해 상위 1개 결과의 `{ videoId, title }` 반환. 결과 없음/실패
  시 `{ videoId: null }`. 인증은 기존 `/api/realtime/calendar-event`와 동일
  패턴(`auth()`, role === "patient").
- **`app/api/music/history/route.ts`** (신규): `POST { title: string; videoId:
  string }` → `PlayedSong` 생성. 같은 인증 패턴.
- **`lib/music/recentPlays.ts`** (신규): `buildRecentPlaysContext(patientId:
  string): Promise<string>`. 최근 재생 15곡 제목을 시간 역순으로 가져와 줄바꿈
  목록으로 포맷(`buildRecentCalendarEvents`/`buildPreviousSessionContext`와
  동일 패턴). 재생 이력 없으면 빈 문자열.
- **`app/api/realtime/token/route.ts`** (수정): `Promise.all`에
  `buildRecentPlaysContext(patientId)` 추가, instructions에 `[최근 들은 노래]`
  블록 주입. `session.tools`에 `play_song`(`{query: string}` required),
  `stop_song`(파라미터 없음) 추가.
- **`components/MusicOverlay.tsx`** (신규): YouTube IFrame Player
  (`<iframe src="https://www.youtube.com/embed/{videoId}?autoplay=1">`)를 대화
  화면 우측 하단에 겹쳐서 표시, 항상 보이는 X 버튼. `app/page.tsx`에 조건부
  렌더링.
- **`hooks/useRealtimeConversation.ts`** (수정): `web_search`/`add_calendar_event`와
  같은 자리에 `play_song`, `stop_song` 툴 호출 분기 추가.
  - `play_song`: `/api/music/search` 호출 → 성공 시 오버레이 상태(videoId, title)
    세팅 + `/api/music/history`로 기록(fire-and-forget, 실패해도 재생 자체엔
    영향 없음 - 이력은 부가 정보) + `function_call_output`으로 재생 시작 알림.
    실패 시 오버레이 안 띄우고 실패 메시지 전달.
  - `stop_song`: 오버레이 상태 `null`로 초기화 + `function_call_output`으로
    정지 확인.

## 에러 처리

- 검색 결과 없음/`yt-search` 예외 → 오버레이 안 띄움, `function_call_output`에
  "그 노래를 못 찾았어요" 메시지 → 모델이 자연스럽게 사용자에게 전달(강제 재시도
  없음 - 캘린더처럼 사용자가 다시 말하면 모델이 다시 시도).
- `/api/music/history` 저장 실패 → 재생 자체는 계속 진행(사용자에게 안 알림,
  다음 세션 취향 컨텍스트가 한 곡 덜 반영될 뿐).
- IFrame 로드 실패(임베드 차단 등) → 오버레이에 짧은 에러 문구 표시, X로 닫기.
- 재생 중 스피커 소리가 마이크로 들어가 Azure VAD가 오인식할 가능성 → 알려진
  리스크로 남김, 오버레이 X 버튼이 수동 안전장치.

## 테스트 계획

- `app/api/music/search/route.ts`, `app/api/music/history/route.ts`,
  `lib/music/recentPlays.ts`: `npx tsc --noEmit`, `npx eslint` — 테스트 러너
  없는 이 저장소 관례대로, 가능하면 curl/로컬 DB 조회로 수동 검증.
- 실기기 검증(핵심 리스크): 음성으로 "노래 틀어줘" → 모델이 추천 후 확인 →
  동의 → 오버레이에 실제 영상 재생되는지. "다른 곡 틀어줘"로 교체되는지,
  "그만"으로 정지되는지. 재생 중 음성 인식이 스피커 소리에 오작동하지 않는지.
  다음 세션에서 "[최근 들은 노래]"가 인스트럭션에 반영돼 취향 참고한 제안이
  나오는지.
