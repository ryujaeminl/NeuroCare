# 뉴로케어

알츠하이머 환자를 위한 AI 음성 대화(기억 회상) 앱. 사람과 대화하는 것처럼 느껴지는 빠른
응답 속도와 barge-in(끼어들기)을 목표로 한다.

두 가지로 구성되어 있다:
- **웹앱** (`app/`, `server/`) — 대시보드 + 대화 엔진(VAD~턴종료~LLM~TTS~barge-in) 전체.
  브라우저 탭이 열려 있는 동안 동작한다.
- **Android 앱** (`android/`) — 웹앱을 WebView로 그대로 감싸고, 폰이 잠겨있거나 앱이
  꺼져 있어도 이름을 부르면 앱이 깨어나는 백그라운드 웨이크워드 서비스만 네이티브로
  추가한 것. 자세한 내용은 [android/README.md](android/README.md) 참고.

## 데이터 계층 (인증 / 대화저장 / 기록 / 기분분석)

- **계정 (`lib/auth/`)** — NextAuth(Auth.js) Credentials 로그인. `User.role`이 `patient` /
  `guardian`으로 나뉘고, `PatientGuardianLink`로 다대다 연결한다. 환자 계정이 가진 초대
  코드를 보호자가 입력하면 연동되고(`/guardian/link`), 어느 쪽에서든 해제할 수 있다.
  세션에 `linkedPatientIds`를 실어 화면마다 DB를 다시 뒤지지 않게 했다.
  **권한 원칙**: 보호자는 연동된 환자 기록을 *읽기만* 할 수 있고, 대화 저장 같은 쓰기는
  환자 본인만 가능하다. 모든 조회 API가 `lib/auth/permissions.ts`를 거친다.
- **대화 저장 (`lib/memory/`)** — 턴이 확정될 때마다 SQLite(`Turn`)에 원문을 넣고, 같은
  내용을 Upstage 임베딩(4096차원)으로 벡터화해 Pinecone에 올린다. 새 발화가 들어오면
  과거 유사 대화를 찾아 `/api/chat`의 시스템 프롬프트에 붙여(RAG) "지난번에 말씀하신
  손주 이야기"처럼 자연스러운 회상을 유도한다.
- **기록 화면 (`app/history`, `app/guardian`)** — 날짜별 세션 목록 → 대화 스크립트 +
  그날 기분, 키워드 검색, 기분 추이 차트(`components/MoodChart.tsx`, 라이브러리 없이 SVG).
  환자용은 큰 글씨로 단순하게, 보호자용은 같은 컴포넌트에 밀도만 높여 재사용한다.
- **기분 분석 (`lib/moodAnalysis.ts`)** — 세션 종료 시 Solar에 JSON 강제 출력으로 질의해
  `mood / confidence / summary / notable_moments`를 받는다. 근거 구절을 함께 남겨 보호자가
  맥락을 확인할 수 있다. **의학적 진단이 아니라는 면책 문구를 기록 화면에 상시 노출**한다.
- **화자 인식 (`server/speaker.py`)** — resemblyzer로 성문을 등록해두면(`/account`에서 8초
  녹음) 등록된 본인 목소리만 대화로 인정한다. 실측 결과 동일 화자 0.93 / 다른 화자 0.63으로
  임계값 0.70이 둘 사이를 잘 가른다. 미등록 상태에서는 기존과 똑같이 동작한다.

### 개발용 테스트 계정

`npx prisma db seed`로 생성된다.

| 역할 | 이메일 | 비밀번호 | 비고 |
| --- | --- | --- | --- |
| 환자 | `patient@test.local` | `test1234` | 초대코드 `NEURO-1234` |
| 보호자 | `guardian@test.local` | `test1234` | 위 환자와 연동됨 |

## 현재 구현 범위 (음성 파이프라인)

- **홈 화면(`/`) = 대화 화면**: 클릭도 웨이크워드도 필요 없다. 앱을 열면 마이크가 바로
  켜져 있고, 그냥 말하면 AI가 답한다. 디자인 시안의 대시보드(마스코트, 인사말, 알림
  배너, 가족/일정/기분/활동/메시지 카드)는 그대로 두고, 인사말 아래 안내 문구 한 줄만
  지금 상태(듣는 중/생각하는 중/답하는 중/전사된 말)를 보여주도록 바꿨다. 원래는 마스코트를
  탭하면 별도 `/conversation` 화면으로 이동하는 구조였는데, "클릭해서 들어가는 게 아니라
  그냥 말하면 대화가 이어지는 형식"을 원한다는 피드백을 받아 대화 엔진 자체를 이 화면에
  합쳤다 — 이제 `/conversation`은 없다.
- **자동 턴 종료 판단**: VAD가 발화 구간을 감지할 때마다 그 구간만 faster-whisper로
  전사하고 텍스트를 이어붙인 뒤(오디오 자체를 이어붙이면 이음매에서 부자연스러운 끊김이
  생겨 인식이 흐트러져서, 텍스트만 이어붙이는 방식을 쓴다), `lib/turnDetector.ts`의 규칙
  (종결어미/조사·접속사·연결어미/필러)으로 문장이 끝났는지 판단한다. 완결이면 0.7초 만에,
  미완결(머뭇거림)이면 `hooks/useSpeechCalibration.ts`가 세션 중 관찰한 그 환자의 평균
  재개 간격을 반영해 2~3.5초까지 기다렸다가 턴을 마무리한다.
- **LLM 응답(Upstage Solar)**: 사용자 턴이 끝나면 `app/api/chat/route.ts`가 Upstage
  Solar(`solar-mini`)에 스트리밍으로 질의하고, `lib/llmStream.ts`가 문장 단위로 잘라
  TTS에 넘긴다. 같은 질문을 반복하면(정규화 후 일치) 세션 내 캐시로 즉시 답한다.
- **TTS(CLOVA Voice 우선, edge-tts 폴백) + 진짜 barge-in**: `app/api/tts/route.ts`가
  네이버 클라우드 CLOVA Voice(`lib/tts/clovaVoice.ts`)로 먼저 합성을 시도하고, 자격
  증명이 없거나 실패하면 `server/main.py`의 edge-tts(`/tts`, `ko-KR-SunHiNeural`)로
  폴백한다. 그마저 실패하면 `lib/speechQueue.ts`(브라우저 내장 SpeechSynthesis)로 한 번
  더 폴백한다(삼중 안전장치). `hooks/useAudioQueue.ts`가 문장 오디오를 순서대로 재생하고,
  AI가 말하는 동안에도 `useVAD`(마이크)를 계속 켜둔 채 `hooks/useBargeIn.ts`가 사용자의
  재발화를 감지하면 즉시 오디오를 fade-out으로 멈추고 LLM 요청을 취소한 뒤 그 발화를 새
  턴으로 이어받는다. 다만 마이크가 화자를 구분하지 못하는 한 AI 자신의 목소리가
  스피커→마이크로 다시 들어와 오탐지될 위험이 있다 — vad-web이 기본으로 켜는
  `echoCancellation`이 어느 정도 걸러주지만 완벽하지 않으므로, 헤드폰 사용 시 가장
  안정적으로 동작한다.

### 잡음(TV 소리 등) 대응

완벽한 해결책은 아니지만(마이크 하드웨어로 화자를 구분하지 않는 한 근본적인 한계가 있다),
아래 세 겹으로 완화한다:
- `hooks/useVAD.ts`: `positiveSpeechThreshold`(0.8)/`negativeSpeechThreshold`(0.65)를
  더 높이고 `minSpeechMs`(700ms)를 늘려, 마이크에서 멀리 떨어진/작은 소리나 짧은 잡음
  블립에는 덜 반응하도록 함
- `hooks/useConversationEngine.ts`: VAD가 발화로 판정해도, 그 구간의 평균 음량(dBFS)이
  너무 작으면(`MIN_SPEECH_DBFS`, 기본 -40dB) whisper 호출 자체를 생략한다 — VAD 확률은
  "말소리 패턴인지"만 보고 크기/거리는 못 보므로 별도 음량 게이트를 추가한 것
- `server/main.py`: whisper 자체 VAD 필터(`vad_filter=True`)에 더해 `no_speech_prob`(<0.5)와
  `avg_logprob`(>-0.8, 모델이 스스로 확신하는 정도) 둘 다 만족해야 텍스트를 채택하고,
  TV/방송 자막에서 자주 나오는 정형 문구(예: "시청해주셔서 감사합니다")가 발화 전체와
  일치하면 빈 문자열로 처리

실사용 피드백에서 잡음이 너무 많이 인식되어(2026-07-27) 위 세 값을 한 단계씩 더 엄격하게
상향했다(`MIN_SPEECH_DBFS` -45→-40, `positiveSpeechThreshold` 0.7→0.8,
`negativeSpeechThreshold` 0.55→0.65, `minSpeechMs` 500→700ms). 그래도 여전히 너무 자주
반응한다면 `MIN_SPEECH_DBFS`를 -40에서 더 -35 쪽으로(더 엄격하게) 올려보고, 반대로 환자
목소리가 작아서 안 잡히는 문제가 생기면 -45~-50 쪽으로(더 관대하게) 낮춘다.

## 프로젝트 구조

```
app/
  page.tsx                 # 홈 = 대화 화면 (대시보드 + 대화 엔진)
  login/ signup/ account/  # 로그인 · 회원가입 · 내 계정(초대코드/목소리 등록)
  history/                 # 환자용 대화 기록
  guardian/                # 보호자 대시보드 + link/ (초대코드 입력)
  api/stt/                 # FastAPI(/transcribe)로 프록시 (+화자 검증용 speaker_id 전달)
  api/chat/                # Upstage Solar 스트리밍 프록시 (+과거 대화 RAG 주입)
  api/tts/                 # CLOVA Voice 우선 -> 실패 시 FastAPI(edge-tts)로 폴백
  api/auth/                # NextAuth 핸들러 + register / invite
  api/sessions/ turns/     # 대화 세션 생성 · 턴 저장(+Pinecone 색인)
  api/mood/                # 세션 종료 + 기분 분석
  api/history/             # 기록 목록 · 상세 · 키워드 검색
  api/guardian/patients/   # 연동된 환자 목록
  api/enroll/              # 내 목소리 성문 등록 · 조회 · 해제
hooks/
  useConversationEngine.ts # VAD~턴종료~LLM~TTS~barge-in 전체를 묶는 대화 엔진
  useConversationPersistence.ts # 대화 저장 부수효과 (음성 로직과 분리)
  useVAD.ts                # Silero VAD (브라우저, 발화 구간 오디오 + 시각 인디케이터)
  useSpeechCalibration.ts  # 환자별 미완결 무음 임계값 개인화
  useAudioQueue.ts         # TTS 오디오 순차 재생 + fade-out 정지
  useBargeIn.ts            # AI 발화 중 사용자 재발화 감지 -> 끼어들기 트리거
components/
  ProgressRing.tsx         # 대시보드 활동 요약용 원형 진행률 표시
  HistoryView.tsx          # 기록 화면 본체 (환자/보호자 공용)
  HistoryTimeline.tsx      # 날짜별 세션 목록
  MoodChart.tsx            # 기분 추이 (라이브러리 없이 인라인 SVG)
  VoiceEnrollment.tsx      # 본인 목소리 등록 UI
  Providers.tsx            # NextAuth SessionProvider
lib/
  whisperClient.ts         # FastAPI 백엔드 호출 래퍼 (전사 + 성문 등록)
  turnDetector.ts          # 문장 완결성 규칙 기반 판단 + 기본 무음 임계값
  llmStream.ts             # /api/chat 스트리밍 소비 + 문장 단위 콜백
  moodAnalysis.ts          # Solar JSON 강제 출력으로 정서 톤 분석
  speechQueue.ts           # SpeechSynthesis 최종 폴백 TTS 큐
  auth/authOptions.ts      # NextAuth 설정 (role, linkedPatientIds 주입)
  auth/permissions.ts      # 환자/보호자 접근 권한 체크 (모든 조회 API가 경유)
  db/prisma.ts             # Prisma 싱글턴 (SQLite 드라이버 어댑터)
  db/types.ts              # SQLite에 없는 enum/배열을 다루는 유니온 타입 + 파서
  memory/embedClient.ts    # Upstage 임베딩 (4096차원)
  memory/pineconeClient.ts # Pinecone upsert/query (키 없으면 자동 비활성화)
  tts/                     # TTSProvider 인터페이스 + CLOVA/클라이언트 구현
  audio/encodeWav.ts       # Float32Array -> WAV 인코딩
prisma/
  schema.prisma            # User / PatientGuardianLink / ConversationSession / Turn / MoodAnalysis
  seed.ts                  # 개발용 테스트 계정
server/
  main.py                  # FastAPI: /transcribe /tts /enroll
  speaker.py               # resemblyzer 성문 등록·검증
  requirements.txt         # + requirements-speaker.txt (화자 인식 별도 설치)
public/
  mascot-dog.png           # 홈 화면 마스코트 (d_s/screen.png 시안에서 배경 제거해 추출)
  vad/                     # vad-web 에셋 (postinstall로 자동 복사, git 미포함)
```

## 실행 방법

### 1. Python STT 백엔드 (faster-whisper + edge-tts 폴백)

`uv`(https://docs.astral.sh/uv/)가 설치되어 있어야 한다.

```bash
uv venv --python 3.11 server/.venv
uv pip install --python server/.venv -r server/requirements.txt
```

화자 인식(본인 목소리만 인식)까지 쓰려면 두 줄을 더 실행한다. `webrtcvad`가 Windows에서
C++ 빌드 도구를 요구해서, 프리빌드 휠로 대체하고 `--no-deps`로 설치하는 우회가 필요하다:

```bash
uv pip install --python server/.venv torch --index-url https://download.pytorch.org/whl/cpu
uv pip install --python server/.venv --no-deps -r server/requirements-speaker.txt
```

```bash
cd server
.venv/Scripts/python.exe -m uvicorn main:app --reload --port 8000
```

첫 실행 시 `faster-whisper` `small` 모델을 자동 다운로드한다(인터넷 필요, 이후에는 캐시 사용).

### 2. Next.js 앱

```bash
npm install
cp .env.local.example .env.local
npx prisma migrate dev
npx prisma db seed
npm run dev
```

`npm install` 이후 `postinstall` 스크립트가 `@ricky0123/vad-web`/`onnxruntime-web`의
onnx/wasm 자산을 `public/vad/`로 자동 복사한다.

`http://localhost:3000` 접속 → 로그인(위 테스트 계정) → 마이크 권한 허용 → 바로 말을 걸면 된다.

### 3. 환경 변수

`.env.local`에 다음을 채운다:
- `UPSTAGE_API_KEY` — https://console.upstage.ai/api-keys
  (필수. LLM 응답 생성과 대화 임베딩 양쪽에 쓰인다)
- `AUTH_SECRET` — 필수. `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
- `NCP_CLOVA_CLIENT_ID` / `NCP_CLOVA_CLIENT_SECRET` — https://console.ncloud.com
  (선택. 비워두면 자동으로 edge-tts로 대체되므로 없어도 앱은 동작한다)
- `PINECONE_API_KEY` / `PINECONE_INDEX` — https://app.pinecone.io
  (선택. **인덱스를 dimension=4096, metric=cosine으로 만들어야 한다.** 비워두면 대화는
  SQLite에만 저장되고 과거 대화 검색(RAG)만 자동으로 꺼진다)

DB 경로(`DATABASE_URL`)는 `.env`에 있다 — Prisma CLI가 `.env.local`을 읽지 못하기 때문이다.

## 다음 단계 로드맵

1. ~~VAD + faster-whisper 기본 파이프라인~~ (완료)
2. ~~턴 종료 판단 로직 (의미완결성 규칙 기반 + 동적 무음 임계값 + 개인화 캘리브레이션)~~ (완료)
3. ~~LLM 스트리밍(Upstage Solar) + 세션 캐싱~~ (완료)
4. ~~edge-tts + 오디오 큐 + 진짜 barge-in~~ (완료)
5. ~~CLOVA Voice 연동 + 클릭 없이 홈 화면에서 바로 대화~~ (완료)
6. ~~Android 네이티브 웨이크워드 앱(WebView 래퍼)~~ (완료, 실제 음성 트리거는 실기기 확인 필요 — `android/README.md` 참고)
7. ~~인증(환자/보호자) + 대화 저장(SQLite+Pinecone) + 기록 화면 + 기분 분석 + 화자 인식~~ (완료)
8. 남은 것:
   - **저장 데이터 암호화(at-rest)와 접근 로그** — 대화 내용은 민감정보라 실배포 전 필수.
     지금은 SQLite 평문이다.
   - 보호자 알림 트리거(부정적 신호가 반복될 때 푸시)
   - UX 다듬기(파형/"생각 중" 표시 고도화, 헤드폰 권장 안내 등 barge-in 오탐 완화)
