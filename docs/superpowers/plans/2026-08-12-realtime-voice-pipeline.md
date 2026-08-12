# Realtime 음성 파이프라인 (1단계) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 웨이크워드 → Azure OpenAI Realtime API(WebRTC, `gpt-realtime`) 세션 → 음성 대화가
안드로이드 앱에서 실제로 동작하게 만든다. 캘린더/음악/기억 등 턴별 동적 컨텍스트는
범위 밖(다음 스펙).

**Architecture:** 클라이언트(WebView)가 서버에서 임시토큰을 받아 Azure와 WebRTC로 직결하고
(마이크→모델→스피커, 왕복 없음), data channel의 자막 이벤트로 작별 문구 감지·응급 감지만
서버에 알린다. 세션 시작/종료 지점은 기존 네이티브 lifecycle(웨이크워드 서비스
stop/restart, `Android.closeApp()`)을 그대로 재사용한다.

**Tech Stack:** Next.js API Routes, 브라우저 WebRTC(`RTCPeerConnection`), Azure OpenAI
Realtime API(GA, `/openai/v1/realtime/*`), 기존 Prisma/next-auth 세션.

## Global Constraints

- Azure 리소스/키는 `.env.local`의 `ANTHROPIC_FOUNDRY_RESOURCE` / `ANTHROPIC_FOUNDRY_API_KEY`를
  그대로 재사용한다(Cognitive Services 멀티서비스 리소스 하나에 Foundry Claude와
  Azure OpenAI Realtime이 같이 물려있음 - 새 env var 불필요, 단 배포 이름은 새로 추가).
- Realtime 배포 이름은 `gpt-realtime`(이미 Azure에 배포 완료, 확인됨).
- voice는 `marin` 고정(사용자가 실측으로 확인).
- 세션 시작/종료에 새 네이티브(Kotlin) 코드는 만들지 않는다 - 기존
  `MainActivity.onResume()` / `Android.closeApp()` 지점을 그대로 쓴다.
- 이 저장소엔 단위테스트 러너가 없다(package.json에 test 스크립트 없음) - 각 태스크의
  검증은 `npx tsc --noEmit`, `npx eslint`, 그리고 raw HTTP/브라우저로 하는 수동 검증으로
  한다. 새 테스트 프레임워크를 이 계획에서 들이지 않는다(기존 관례 그대로).

---

### Task 1: 페르소나 프롬프트를 공유 모듈로 추출

**Files:**
- Create: `lib/persona.ts`
- Modify: `app/api/chat/route.ts:16` (import 추가), `app/api/chat/route.ts:34-183` (상수/함수
  삭제하고 import로 교체), `app/api/chat/route.ts:267` (호출부를 새 함수로 교체)

**Interfaces:**
- Produces: `lib/persona.ts`가 `export const SYSTEM_PROMPT_RULES: string`,
  `export const SYSTEM_PROMPT_EXAMPLES: string`,
  `export function buildStageGuidance(stage: DementiaStage): string`,
  `export function buildBasePersonaPrompt(stage: DementiaStage): string`
  (= `SYSTEM_PROMPT_RULES + buildStageGuidance(stage) + "\n" + SYSTEM_PROMPT_EXAMPLES`,
  chat/route.ts:267의 표현식을 함수로 뽑은 것)를 export한다. Task 2가 이 네 개를 그대로 씀.

- [ ] **Step 1: `lib/persona.ts` 작성**

`app/api/chat/route.ts`의 다음 세 부분을 그대로(글자 하나도 바꾸지 말고) 옮긴다:
- 34번째 줄부터 시작하는 `const SYSTEM_PROMPT_RULES = \`...\`;` 전체
- 그 바로 다음 `const SYSTEM_PROMPT_EXAMPLES = \`...\`;` 전체
- `function buildStageGuidance(stage: DementiaStage): string { ... }` 전체(125-183번째 줄,
  위에 달린 JSDoc 주석 포함)

파일 맨 위에 import 추가, 맨 아래에 새 함수 추가:

```typescript
import type { DementiaStage } from "@/lib/db/types";

// ... (옮겨온 SYSTEM_PROMPT_RULES, SYSTEM_PROMPT_EXAMPLES, buildStageGuidance 그대로) ...

/** 환자 단계별 규칙까지 합친 기본 페르소나 프롬프트. 가족관계/기억/일정 같은 턴별
 * 컨텍스트는 각 호출부가 알아서 뒤에 덧붙인다 - 이 함수는 정적인 부분만 담당한다. */
export function buildBasePersonaPrompt(stage: DementiaStage): string {
  return SYSTEM_PROMPT_RULES + buildStageGuidance(stage) + "\n" + SYSTEM_PROMPT_EXAMPLES;
}
```

- [ ] **Step 2: `app/api/chat/route.ts`에서 옮긴 부분 삭제하고 import로 교체**

`app/api/chat/route.ts:16` 아래에 추가:

```typescript
import { buildBasePersonaPrompt } from "@/lib/persona";
```

옮긴 세 블록(`SYSTEM_PROMPT_RULES`, `SYSTEM_PROMPT_EXAMPLES`, `buildStageGuidance`)은
`app/api/chat/route.ts`에서 완전히 삭제한다.

`app/api/chat/route.ts:220`의
```typescript
prompt: SYSTEM_PROMPT_RULES + "\n" + SYSTEM_PROMPT_EXAMPLES + weatherBlock,
```
을 (비로그인 경로, dementiaStage 없음 - `buildStageGuidance("moderate")`가 기존 기본값과
동일하므로 "moderate" 고정으로 바꿔도 동작 동일):
```typescript
prompt: buildBasePersonaPrompt("moderate") + weatherBlock,
```
로 교체.

`app/api/chat/route.ts:267`의
```typescript
let prompt = SYSTEM_PROMPT_RULES + buildStageGuidance(dementiaStage) + "\n" + SYSTEM_PROMPT_EXAMPLES;
```
을
```typescript
let prompt = buildBasePersonaPrompt(dementiaStage);
```
로 교체.

- [ ] **Step 3: 타입체크/린트로 검증**

Run: `npx tsc --noEmit -p .`
Expected: 에러 없음

Run: `npx eslint app/api/chat/route.ts lib/persona.ts`
Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add lib/persona.ts app/api/chat/route.ts
git commit -m "refactor: 페르소나 프롬프트를 lib/persona.ts로 추출 (Realtime 라우트와 공유 예정)"
```

---

### Task 2: 임시토큰 발급 라우트

**Files:**
- Create: `app/api/realtime/token/route.ts`

**Interfaces:**
- Consumes: `lib/persona.ts`의 `buildBasePersonaPrompt(stage)` (Task 1),
  `buildFamilyRoster(patientId): Promise<string>` (기존, `@/lib/memory/familyContext`),
  `auth()` (기존, `@/lib/auth/authOptions`), `prisma` (기존, `@/lib/db/prisma`).
- Produces: `GET /api/realtime/token` → `200 { token: string; resource: string;
  deployment: string }` 또는 `401`/`502`.

- [ ] **Step 1: 라우트 작성**

```typescript
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/authOptions";
import { prisma } from "@/lib/db/prisma";
import { buildFamilyRoster } from "@/lib/memory/familyContext";
import { buildBasePersonaPrompt } from "@/lib/persona";
import type { DementiaStage } from "@/lib/db/types";

// gpt-realtime 배포는 Azure OpenAI 쪽(openai.azure.com) 엔드포인트를 쓴다 - Foundry Claude
// 채팅과 같은 Cognitive Services 리소스/키를 공유하지만 API 형태가 다르고 아직
// @anthropic-ai/foundry-sdk나 openai SDK가 이 GA 엔드포인트를 감싸주지 않아 raw fetch로
// 호출한다. 임시토큰(ephemeral token)은 여기서만 발급하고 실제 키는 브라우저에 절대
// 안 보낸다 - 브라우저는 이 임시토큰으로만 Azure와 WebRTC 연결한다.
const AZURE_RESOURCE = process.env.ANTHROPIC_FOUNDRY_RESOURCE;
const AZURE_API_KEY = process.env.ANTHROPIC_FOUNDRY_API_KEY;
const REALTIME_DEPLOYMENT = process.env.REALTIME_DEPLOYMENT || "gpt-realtime";

export async function GET() {
  if (!AZURE_RESOURCE || !AZURE_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_FOUNDRY_RESOURCE / ANTHROPIC_FOUNDRY_API_KEY가 설정되지 않았습니다." },
      { status: 500 },
    );
  }

  const session = await auth();
  if (session?.user?.role !== "patient") {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }
  const patientId = session.user.id;

  const [roster, patientRecord] = await Promise.all([
    buildFamilyRoster(patientId),
    prisma.user.findUnique({ where: { id: patientId }, select: { dementiaStage: true } }),
  ]);
  const dementiaStage = (patientRecord?.dementiaStage as DementiaStage | null) ?? "moderate";

  let instructions = buildBasePersonaPrompt(dementiaStage);
  if (roster) {
    instructions += `

[등록된 가족 관계]
아래는 보호자가 미리 등록해 둔, 확인된 가족 관계입니다. 대화 중 가족 이야기가 나오면 이 정보만 사용하세요.
아래 목록에 없는 가족 관계는 추측하거나 지어내지 마세요.
${roster}`;
  }

  const azureRes = await fetch(
    `https://${AZURE_RESOURCE}.openai.azure.com/openai/v1/realtime/client_secrets`,
    {
      method: "POST",
      headers: { "api-key": AZURE_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model: REALTIME_DEPLOYMENT,
          instructions,
          audio: { output: { voice: "marin" } },
        },
      }),
    },
  );

  if (!azureRes.ok) {
    const detail = await azureRes.text().catch(() => "");
    return NextResponse.json(
      { error: `Azure Realtime 토큰 발급 실패 (${azureRes.status}): ${detail}` },
      { status: 502 },
    );
  }

  const data = (await azureRes.json()) as { value?: string };
  if (!data.value) {
    return NextResponse.json({ error: "토큰 응답에 value가 없습니다." }, { status: 502 });
  }

  return NextResponse.json({ token: data.value, resource: AZURE_RESOURCE, deployment: REALTIME_DEPLOYMENT });
}
```

- [ ] **Step 2: 타입체크/린트**

Run: `npx tsc --noEmit -p .`
Expected: 에러 없음

Run: `npx eslint app/api/realtime/token/route.ts`
Expected: 에러 없음

- [ ] **Step 3: 로컬 dev 서버로 수동 검증**

`npm run dev`로 서버 띄운 상태에서, 로그인 안 한 상태로:

Run: `curl -i http://localhost:3000/api/realtime/token`
Expected: `HTTP/1.1 401`

로그인한 환자 세션 쿠키로 (`/login`에서 로그인 후 브라우저 쿠키를 복사하거나, 이미 이
세션에서 여러 번 쓴 로컬 DB 격리 + Playwright 루틴으로) 다시 호출:
Expected: `200`, 응답 JSON에 `token`(문자열), `resource: "youjaemin0722-2893-resource"`,
`deployment: "gpt-realtime"` 포함.

- [ ] **Step 4: 커밋**

```bash
git add app/api/realtime/token/route.ts
git commit -m "feat: Realtime 세션용 임시토큰 발급 라우트 추가"
```

---

### Task 3: 응급 감지 라우트

**Files:**
- Create: `app/api/realtime/distress-check/route.ts`

**Interfaces:**
- Consumes: `maybeTriggerVoiceDistress(patientId: string, latestUserText: string): Promise<void>`
  (기존, `@/lib/guardian/emergencyDispatcher`), `auth()` (기존).
- Produces: `POST /api/realtime/distress-check` body `{ text: string }` → `204` 또는 `401`.
  Task 4의 클라이언트 훅이 사용자 발화 자막이 나올 때마다 이 라우트를 호출한다.

- [ ] **Step 1: 라우트 작성**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/authOptions";
import { maybeTriggerVoiceDistress } from "@/lib/guardian/emergencyDispatcher";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (session?.user?.role !== "patient") {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const { text } = (await request.json()) as { text?: string };
  if (text && text.trim()) {
    // 응답을 막지 않는다 - chat/route.ts의 기존 호출부와 동일하게 fire-and-forget.
    void maybeTriggerVoiceDistress(session.user.id, text);
  }

  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 2: 타입체크/린트**

Run: `npx tsc --noEmit -p .`
Expected: 에러 없음

Run: `npx eslint app/api/realtime/distress-check/route.ts`
Expected: 에러 없음

- [ ] **Step 3: 수동 검증**

로그인한 세션 쿠키로:

Run: `curl -i -X POST http://localhost:3000/api/realtime/distress-check -H "Content-Type: application/json" -d '{"text":"살려주세요"}'`
Expected: `204`, 그리고 (기존 `maybeTriggerVoiceDistress` 로직이 실제 발동 조건을 만족하면)
보호자 쪽에 응급 알림이 기존과 동일하게 발생 - 이건 새 로직이 아니라 기존 함수를 그대로
호출하는 것이므로 회귀 확인 성격.

- [ ] **Step 4: 커밋**

```bash
git add app/api/realtime/distress-check/route.ts
git commit -m "feat: Realtime 세션용 응급 감지 라우트 추가"
```

---

### Task 4: Realtime WebRTC 클라이언트 훅

**Files:**
- Create: `hooks/useRealtimeConversation.ts`

**Interfaces:**
- Consumes: `GET /api/realtime/token` (Task 2), `POST /api/realtime/distress-check` (Task 3),
  브라우저 `RTCPeerConnection`/`navigator.mediaDevices.getUserMedia`(표준 Web API).
- Produces: `useRealtimeConversation(): UseConversationEngineResult` — `hooks/useConversationEngine.ts:17-37`의
  `ConversationLogEntry`, `ConversationPhase`, `UseConversationEngineResult` 타입을
  **그대로** 재사용해서 반환값 모양을 맞춘다(Task 5에서 `app/page.tsx`가 이 훅으로
  갈아끼울 때 페이지 코드를 거의 안 건드리기 위함).

  구체적 매핑(Azure Realtime data channel 이벤트 → 기존 상태):
  - `input_audio_buffer.speech_started` 수신 → `phase = "transcribing"`, `vadUserSpeaking = true`
  - `input_audio_buffer.speech_stopped` 수신 → `vadUserSpeaking = false`, `phase = "thinking"`
  - `output_audio_buffer.started` 수신 → `phase = "speaking"`
  - `output_audio_buffer.stopped` 수신 → `phase = "listening"`, `assistantDraft = ""`
  - `response.output_audio_transcript.delta` 수신 → `assistantDraft`에 이어붙임
  - `response.output_audio_transcript.done` 수신 → `log`에 `{id: Date.now(), role: "assistant", text: transcript}` 앞에 추가(기존 `setLog((prev) => [entry, ...prev])` 패턴과 동일)
  - `conversation.item.input_audio_transcription.completed` 수신 → `log`에 user 항목 추가 +
    `/api/realtime/distress-check`에 POST + 작별 문구 정규식 매치 시
    `window.Android?.closeApp?.()` 호출
  - `error` 타입 이벤트 수신 → `errorMsg` 설정
  - `interimText`는 항상 빈 문자열(Realtime은 완료된 자막만 준다 - 페이지 쪽 폴백
    문구 "듣고 있어요..."가 그대로 보임, 회귀 아님)
  - `photo`는 항상 `null`, `dismissPhoto`는 no-op(사진 기능은 2단계 범위)
  - `vadError`는 `getUserMedia` 실패 시 메시지 설정, 그 외 `null`
  - `vadListening`은 WebRTC 연결 성공 후 `true`, 연결 전/종료 후 `false`

작별 문구 정규식은 `hooks/useConversationEngine.ts:120-121`과 **글자 하나 다르지 않게**
그대로 복사한다(별도 모듈로 뽑지 않는다 - 이 훅 하나에서만 쓰고, 기존 훅은 이 작업
이후 곧 삭제될 예정이라 공유 모듈을 새로 만드는 게 낭비다):

```typescript
const END_CONVERSATION_PATTERN =
  /^(대화종료|이제그만|그만할래|그만하자|끝낼래|끝내자|잘자|잘자요|안녕히주무세요|주무세요)[.!?~,]*$/;
```

- [ ] **Step 1: 훅 작성**

```typescript
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ConversationLogEntry,
  ConversationPhase,
  UseConversationEngineResult,
} from "@/hooks/useConversationEngine";

declare global {
  interface Window {
    Android?: { closeApp?: () => void };
  }
}

const END_CONVERSATION_PATTERN =
  /^(대화종료|이제그만|그만할래|그만하자|끝낼래|끝내자|잘자|잘자요|안녕히주무세요|주무세요)[.!?~,]*$/;

export function useRealtimeConversation(): UseConversationEngineResult {
  const [phase, setPhase] = useState<ConversationPhase>("listening");
  const [assistantDraft, setAssistantDraft] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [log, setLog] = useState<ConversationLogEntry[]>([]);
  const [vadListening, setVadListening] = useState(false);
  const [vadUserSpeaking, setVadUserSpeaking] = useState(false);
  const [vadError, setVadError] = useState<string | null>(null);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const startedRef = useRef(false);

  const connect = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;

    let tokenRes: Response;
    try {
      tokenRes = await fetch("/api/realtime/token");
    } catch {
      setErrorMsg("네트워크 연결을 확인해주세요.");
      startedRef.current = false;
      return;
    }
    if (!tokenRes.ok) {
      setErrorMsg("지금은 대화를 시작할 수 없어요.");
      startedRef.current = false;
      return;
    }
    const { token, resource } = (await tokenRes.json()) as { token: string; resource: string };

    const pc = new RTCPeerConnection();
    peerConnectionRef.current = pc;

    const audioEl = document.createElement("audio");
    audioEl.autoplay = true;
    document.body.appendChild(audioEl);
    pc.ontrack = (event) => {
      audioEl.srcObject = event.streams[0];
    };

    let mic: MediaStream;
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      setVadError(err instanceof Error ? err.message : "마이크 접근 실패");
      startedRef.current = false;
      return;
    }
    pc.addTrack(mic.getAudioTracks()[0]);

    const dataChannel = pc.createDataChannel("realtime-channel");
    dataChannel.addEventListener("message", (event) => {
      const e = JSON.parse(event.data as string);
      switch (e.type) {
        case "input_audio_buffer.speech_started":
          setPhase("transcribing");
          setVadUserSpeaking(true);
          break;
        case "input_audio_buffer.speech_stopped":
          setVadUserSpeaking(false);
          setPhase("thinking");
          break;
        case "output_audio_buffer.started":
          setPhase("speaking");
          break;
        case "output_audio_buffer.stopped":
          setPhase("listening");
          setAssistantDraft("");
          break;
        case "response.output_audio_transcript.delta":
          setAssistantDraft((prev) => prev + (e.delta ?? ""));
          break;
        case "response.output_audio_transcript.done":
          setLog((prev) => [{ id: Date.now(), role: "assistant", text: e.transcript ?? "" }, ...prev]);
          break;
        case "conversation.item.input_audio_transcription.completed": {
          const transcript: string = e.transcript ?? "";
          setLog((prev) => [{ id: Date.now(), role: "user", text: transcript }, ...prev]);
          void fetch("/api/realtime/distress-check", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: transcript }),
          });
          if (END_CONVERSATION_PATTERN.test(transcript.trim().replace(/\s+/g, ""))) {
            window.Android?.closeApp?.();
          }
          break;
        }
        case "error":
          setErrorMsg(e.error?.message ?? "오류가 발생했습니다.");
          break;
      }
    });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const sdpRes = await fetch(`https://${resource}.openai.azure.com/openai/v1/realtime/calls?webrtcfilter=on`, {
      method: "POST",
      body: offer.sdp,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/sdp" },
    });
    if (!sdpRes.ok) {
      setErrorMsg("지금은 대화를 시작할 수 없어요.");
      startedRef.current = false;
      return;
    }
    const answerSdp = await sdpRes.text();
    await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
    setVadListening(true);
  }, []);

  // 페이지 마운트 시 한 번 연결 - 기존 useConversationEngine이 마운트 시 vad.start()를
  // 부르던 것과 동일한 타이밍(app/page.tsx는 이 훅을 호출만 하면 된다). startedRef
  // 가드가 있어 StrictMode의 effect 2회 실행에도 안전하다.
  useEffect(() => {
    void connect();
    return () => {
      peerConnectionRef.current?.close();
    };
  }, [connect]);

  return {
    phase,
    interimText: "",
    assistantDraft,
    errorMsg,
    log,
    vadListening,
    vadUserSpeaking,
    vadError,
    photo: null,
    dismissPhoto: () => {},
  };
}
```

- [ ] **Step 2: 타입체크/린트**

Run: `npx tsc --noEmit -p .`
Expected: 에러 없음

Run: `npx eslint hooks/useRealtimeConversation.ts`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add hooks/useRealtimeConversation.ts
git commit -m "feat: Azure Realtime WebRTC 클라이언트 훅 추가"
```

---

### Task 5: 페이지 연결 + 실기기 검증

**Files:**
- Modify: `app/page.tsx:82`

**Interfaces:**
- Consumes: `useRealtimeConversation()` (Task 4) — `UseConversationEngineResult`와 동일한
  모양이라 `app/page.tsx`의 `engine.*` 사용부는 변경 불필요.

- [ ] **Step 1: 훅 교체**

`app/page.tsx`에서 `useConversationEngine` import를 `useRealtimeConversation`으로 바꾸고,
82번째 줄
```typescript
const engine = useConversationEngine({ persist: session?.user?.role === "patient" });
```
을
```typescript
const engine = useRealtimeConversation();
```
로 교체한다(`persist` 옵션은 새 훅에 없음 - 대화 기록 영속화는 2단계 범위 밖이라
드롭한다).

- [ ] **Step 2: 타입체크/린트**

Run: `npx tsc --noEmit -p .`
Expected: 에러 없음(이 시점에 `useConversationEngine` import가 더 이상 없으면 미사용
경고가 나올 수 있는 다른 파일은 없는지 `npx eslint app/page.tsx`로 확인)

- [ ] **Step 3: APK 빌드 + 실기기 검증 (이 계획의 핵심 미검증 리스크)**

`android/` 디렉터리에서 기존 세션 관례대로 디버그 APK 빌드 후 실기기 설치.

체크리스트:
1. 웨이크워드 부르기 → 앱 뜸 → 몇 초 안에 대화 시작되는지(임시토큰 발급 + WebRTC
   연결 지연 체감)
2. 한국어로 말 걸기 → 응답 음성 나오는지, 지연 체감
3. 말하는 도중 끼어들기(바지인) → AI가 멈추고 듣는지(Realtime 자체 기능, 새로 짠
   코드 없음 - 됨/안 됨만 확인)
4. "그만하자" 같은 작별 문구 → 세션 종료되고 웨이크워드로 돌아가는지
5. 화면 UI(자막/phase 표시)가 이상하게 안 멈추는지

여기서 문제가 나면(특히 WebView의 풀 WebRTC 경로 자체가 안 되는 경우) 이 스펙의 접근
자체를 재검토해야 한다 - 코드를 더 고치는 게 아니라 사용자에게 바로 보고할 것.

- [ ] **Step 4: 커밋**

```bash
git add app/page.tsx
git commit -m "feat: 대화 페이지를 Realtime WebRTC 훅으로 전환"
```
