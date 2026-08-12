# 유튜브 노래 재생 기능 설계

## 목표

환자가 대화 중 음성으로 노래를 요청하면 유튜브에서 검색해서 대화 화면 위에
오버레이로 영상을 띄워 재생한다. 곡명 없이 "노래 틀어줘"만 말해도 AI가 곡을
추천하고 동의를 받아 재생하며, 재생 중 "다른 곡 틀어줘"로 즉시 교체할 수 있다.

## 범위 밖 (Non-goals)

- 재생목록/큐 관리, 재생 이력 저장 — 한 번에 한 곡만, DB 저장 없음
- 보호자 앱에서의 원격 제어 — 이번 기능은 환자 앱 전용
- 네이티브 안드로이드 코드 변경 — 기존 WebView 안에서 웹 기술로 해결

## 아키텍처

```
[환자 발화] → chat/route.ts → detectMusicIntent() → {action, query?}
                                        │
                       action=suggest  →  프롬프트에 "곡 추천 후 동의 묻기" 지시만 추가(재생 안 함)
                       action=play     →  응답 헤더로 클라이언트에 신호 + query 전달
                       action=stop     →  응답 헤더로 클라이언트에 정지 신호
                                        │
                                        ▼
                     [클라이언트] MusicOverlay 컴포넌트가 신호 수신
                                        │
                     action=play → POST /api/music/search {query}
                                        │
                              yt-search로 상위 1개 결과의 videoId 획득
                                        │
                     YouTube IFrame Player에 videoId 로드 + 오버레이 표시 + 재생
```

### 컴포넌트

- **`lib/music/detectMusicIntent.ts`** (신규): 캘린더의 `detectCalendarIntent.ts`와
  같은 패턴. 직전 assistant 턴 + 이번 user 턴을 LLM에 넣어 판단.
  - 반환 타입: `{ action: "suggest" } | { action: "play"; query: string } | { action: "stop" } | null`
  - `suggest`: 곡명 없이 "노래 틀어줘" 류의 요청 (곡 추천 후 동의를 구해야 함)
  - `play`: 곡명이 특정된 요청(직접 지정, 또는 직전 추천에 대한 동의), 확인 없이 바로 재생
  - `stop`: "꺼줘"/"그만" 류
  - `null`: 노래와 무관한 발화

- **`app/api/music/search/route.ts`** (신규): `POST { query: string }` →
  `yt-search`로 검색, 상위 1개 결과의 `{ videoId, title }` 반환. 결과 없음/실패 시
  `{ videoId: null }`.

- **`components/MusicOverlay.tsx`** (신규, 환자 앱): `app/page.tsx`에 조건부 렌더링.
  YouTube IFrame Player API(`<iframe src="https://www.youtube.com/embed/{videoId}?autoplay=1">`)를
  대화 화면 우측 하단에 PIP처럼 겹쳐서 표시. 항상 보이는 닫기(X) 버튼 포함.
  `action=play` 신호를 받으면 `/api/music/search` 호출 → videoId 세팅 → 표시.
  `action=stop` 신호나 X 버튼 클릭 시 언마운트.

### chat/route.ts 연동 (캘린더 패턴 재사용)

- `buildSystemPrompt`의 `Promise.all` 블록에 `detectMusicIntent` 호출 추가
- `action=suggest`일 때: 프롬프트에 "구체적인 곡 하나를 추천하고 '틀어드릴까요?'로
  동의를 구하세요" 지시 블록 추가 (실제 검색은 하지 않음 - 다음 턴에서 동의 확인 후 처리)
- `action=play`/`action=stop`일 때: 캘린더의 `X-Calendar-Sync` 헤더처럼
  `X-Music-Action: play` + `X-Music-Query: <query>` (또는 `X-Music-Action: stop`)
  헤더를 응답에 실어 클라이언트에 전달
- **상태 저장 없음**: `PendingCalendarProposal` 같은 DB 테이블 불필요. "내가 방금
  무슨 곡을 추천했는지"는 대화 히스토리(직전 assistant 메시지)에서 매 턴 새로
  판단하므로 세션/DB에 별도로 남길 게 없다.

## 마이크/오디오 충돌 처리

영상 재생 중 스피커로 나가는 소리가 마이크에 섞여 들어갈 수 있다. 기존
`useBargeIn.ts`의 `isSpeaking`(TTS 재생 중 에코 대비 긴 확인시간) 상태를 재사용 —
영상 재생 중에도 이 플래그를 true로 취급해 같은 임계값을 적용한다. 새로운 에코
캔슬링 로직은 만들지 않는다. 완전히 막지는 못하므로 오버레이의 수동 X 버튼이
음성 인식 실패 시 최종 안전장치 역할을 한다.

## 에러 처리

- 검색 결과 없음 / `yt-search` 실패 → 오버레이 띄우지 않고, 다음 assistant 응답에서
  "지금은 그 노래를 못 찾겠어요" 톤으로 자연스럽게 답함 (규칙 13과 같은 톤: 안 되는
  건 솔직히 말하기)
- IFrame 로드 실패(임베드 차단된 영상 등) → 오버레이에 짧은 에러 문구 + X로 닫기

## 테스트 계획

- `detectMusicIntent`: 단위 테스트로 suggest/play(지정 곡)/play(동의)/stop/null 5가지
  케이스 검증 (캘린더 intent 테스트와 동일 패턴)
- `/api/music/search`: 검색 성공/결과없음/`yt-search` 예외 케이스
- `MusicOverlay`: 곡 재생 표시, X 버튼으로 언마운트, `action=stop` 헤더로 언마운트
- 라이브 검증(이 세션 관례): 로컬 DB 격리 후 Playwright로 실제 채팅 흐름 태워서
  "노래 틀어줘" → 추천 응답 확인, 동의 → 오버레이 표시 확인, "다른 곡" → videoId
  변경 확인
