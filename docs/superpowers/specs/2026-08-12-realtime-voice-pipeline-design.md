# 음성 파이프라인을 Azure OpenAI Realtime API로 교체 (1단계: 핵심 파이프라인)

## 배경

기존 파이프라인은 웨이크워드(네이티브) → 클라이언트 VAD/STT(Whisper) → 서버 텍스트 챗
(Anthropic/Azure Foundry) → 서버 TTS(edge-tts/Clova) → 클라이언트 재생, 총 4단 왕복
구조다. Azure AI Foundry에 `gpt-realtime` 모델을 배포해 WebRTC로 마이크↔스피커를
직접 연결하는 음성-음성 API로 교체하면 이 왕복이 통째로 없어진다.

데스크톱 브라우저 스크래치 테스트(`gpt-realtime`, voice=`marin`)로 한국어 음성 품질과
페르소나 프롬프트(13개 규칙) 준수를 확인했고, 통과했다. 이 스펙은 그 다음 단계 —
실제 안드로이드 앱에 이 파이프라인을 넣는 작업(전체 재설계의 1단계)만 다룬다.

## 목표 / 범위

- 웨이크워드 → Realtime WebRTC 세션 → 음성 대화 → 세션 종료까지, "그냥 대화되는" 상태
- 기존 페르소나 프롬프트(13개 규칙 + 예시)를 세션 시작 시 `instructions`로 주입
- 가족 관계 정보도 세션 시작 시 함께 주입(정적 컨텍스트라 매 턴 갱신 불필요)
- 작별 문구 감지 → 세션 종료, 응급 발화 감지 → 보호자 알림 — 기존 로직 재사용

## 범위 밖 (다음 단계로 미룸)

- 캘린더/음악/기억/사진처럼 "매 턴 프롬프트에 얹던" 동적 컨텍스트 — Realtime은 세션이
  계속 열려있어 함수 호출(tool calling) 방식으로 다시 짜야 하는 별도 서브프로젝트
- 기존 STT/TTS/VAD 코드 삭제 — 이 스펙에서 실기기 검증까지 끝나고 안정적으로 확인된
  다음에 별도로 정리(지금 지우면 문제 생겼을 때 되돌릴 방법이 없음 - 사용자가 완전
  교체를 선택했으므로 최종적으로는 지우되, 삭제 자체는 이 스펙의 산출물이 실기기에서
  동작 확인된 후 진행)
- 보호자 앱 쪽 변경 없음

## 아키텍처

```
[웨이크워드 감지, 네이티브] → MainActivity 실행/포그라운드 복귀
                                       │
                    (기존 그대로) WakeWordService 완전 종료
                                       │
                         WebView가 페이지 로드/재개
                                       │
              클라이언트: POST /api/realtime/token (세션 쿠키 인증)
                                       │
       서버: Azure client_secrets 호출, instructions에 페르소나+가족관계 주입
                                       │
              클라이언트: 임시토큰으로 Azure와 WebRTC 직결
                          (마이크 트랙 추가, 원격 오디오 트랙 재생)
                                       │
                  data channel로 자막 이벤트 수신
                    ├─ 작별 문구 매치 → Android.closeApp()
                    └─ 발화 텍스트 → 응급감지 함수 호출(기존 재사용)
```

### 컴포넌트

- **`app/api/realtime/token/route.ts`** (신규): `GET`, `session?.user?.role === "patient"`
  게이트. Azure `POST https://{resource}.openai.azure.com/openai/v1/realtime/client_secrets`를
  `api-key` 헤더로 호출. `session.instructions`는 기존 `SYSTEM_PROMPT_RULES` +
  `SYSTEM_PROMPT_EXAMPLES` + 치매단계별 가이드(`buildStageGuidance`) + 가족관계
  (`buildFamilyRoster`)를 합친 문자열 — `app/api/chat/route.ts`의 해당 함수들을
  가져와 재사용(로직 중복 금지). `session.audio.output.voice`는 `marin` 고정.
  응답: `{ token, resource, deployment: "gpt-realtime" }`.
- **`hooks/useRealtimeConversation.ts`** (신규, `useConversationEngine.ts` 대체):
  `/api/realtime/token` 호출 → `RTCPeerConnection` 생성 → 마이크 트랙 추가 →
  SDP offer/answer 교환(`https://{resource}.openai.azure.com/openai/v1/realtime/calls`) →
  원격 오디오 트랙을 `<audio autoplay>`에 연결. data channel의
  `conversation.item.input_audio_transcription.completed` 이벤트에서 텍스트를 뽑아
  (a) 기존 `END_CONVERSATION_PATTERN` 매치 시 `window.Android?.closeApp?.()` 호출,
  (b) 새 경량 라우트로 응급감지 전달(아래).
- **`app/api/realtime/distress-check/route.ts`** (신규): `POST { text }`, 세션 게이트,
  내부적으로 `maybeTriggerVoiceDistress(patientId, text)` 그대로 호출. 기존
  `app/api/chat/route.ts`가 하던 걸 텍스트만 받는 별도 라우트로 분리한 것 — 로직
  자체는 옮기지 않고 재사용.
- **`app/page.tsx`**: `useConversationEngine` 대신 `useRealtimeConversation` 사용.

### 세션 시작/종료 지점 (기존 그대로 재사용, 새 네이티브 코드 없음)

- 시작: `MainActivity.onResume()`이 웨이크워드 서비스를 stop하고 WebView를 살리는
  기존 지점 그대로 - 그 다음 JS가 알아서 Realtime 세션을 연다.
- 종료: 작별 문구 감지 시 기존과 동일하게 `Android.closeApp()` → `finish()` →
  `onPause()`/`onDestroy()`가 웨이크워드 서비스 재시작 (기존 로직 무변경).

## 에러 처리

- 임시토큰 발급 실패(네트워크/Azure 쪽 에러) → 화면에 "지금은 대화를 시작할 수
  없어요" 같은 짧은 안내 + 재시도 버튼. 웨이크워드로 돌아가는 경로는 그대로 살아있어
  (네이티브 lifecycle 기반) 앱을 나갔다 다시 부르면 재시도 가능.
- WebRTC 연결 실패(ICE 실패 등) → 위와 동일한 안내, 콘솔에 상세 로그(실기기 디버깅용).
- 세션 도중 연결 끊김 → 자동 재연결 시도 없음(1단계 범위 밖) - 사용자가 다시 불러야 함.

## 테스트 계획

- `/api/realtime/token`: 로그인/비로그인 401, 성공 시 instructions에 규칙 텍스트
  포함되는지 단위 테스트
- 실기기 검증(필수, 이 스펙의 핵심 미검증 리스크): APK 빌드 후 실제 안드로이드
  기기에서 웨이크워드 → Realtime 연결 → 음성 왕복 → 작별 문구로 종료까지 전체
  플로우 확인. 데스크톱 브라우저에서는 이미 통과했지만 WebView의 풀 WebRTC(ICE/STUN
  포함) 경로는 검증된 적 없음 - 여기서 막히면 이 스펙 자체를 재검토해야 함.
- 응급감지: 기존 트리거 문구로 실제 알림이 뜨는지 확인(기존 로직 재사용이라 회귀
  테스트 성격).
