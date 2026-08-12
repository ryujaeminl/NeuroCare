# 강아지 마스코트 3D 스켈레톤 애니메이션 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `components/DogMascot.tsx`를 PNG+CSS 마스코트에서 react-three-fiber
기반 3D 스켈레톤 애니메이션 마스코트로 교체한다.

**Architecture:** `DogMascot`(외피, Canvas/조명/폴백/reduced-motion 처리) +
`DogMascotModel`(glTF 로드, `phase`/`userSpeaking`/`speakingLevel`에 따른
애니메이션 클립 전환). 외부 인터페이스(`DogMascotProps`)는 그대로 유지해
`app/page.tsx` 등 호출부는 변경하지 않는다.

**Tech Stack:** three.js, @react-three/fiber, @react-three/drei (React 19 /
Next.js 16 기존 스택에 추가).

## Global Constraints

- 스펙 문서: `docs/superpowers/specs/2026-08-13-dog-mascot-3d-design.md`.
- 에셋: Quaternius Shiba Inu glTF, CC0,
  `https://static.poly.pizza/ba6d0ee3-bcc0-4ef0-9d3c-a3e245b41c77.glb`(약
  851KB). 클립 12개 중 `Idle`, `Idle_2`, `Idle_2_HeadLow`,
  `Idle_HitReact_Left`, `Idle_HitReact_Right` 4+1개만 사용.
- morph target/턱 뼈 없음 → viseme 정밀 립싱크는 이번 플랜 범위 밖(스펙에
  명시). `viseme` prop은 인터페이스 호환을 위해 `DogMascotProps`에 남기되
  내부에서 쓰지 않는다.
- `DogMascotProps`(`phase`, `userSpeaking`, `speakingLevel`, `viseme`)와
  `app/page.tsx`의 호출부는 수정하지 않는다.
- 이 저장소엔 테스트 러너가 없다(기존 관례) — `npx tsc --noEmit`, `npx eslint`
  로 검증하고 3D 렌더링은 브라우저 수동 확인으로 대체한다.

---

### Task 1: 의존성 추가 + 3D 에셋 다운로드

**Files:**
- Modify: `package.json`
- Create: `public/models/dog.glb`
- Create: `public/models/dog.glb.LICENSE.txt`

**Interfaces:**
- Produces: `public/models/dog.glb` 파일 경로 — Task 2의 `useGLTF("/models/dog.glb")`가
  이 경로를 그대로 참조한다.

- [ ] **Step 1: 의존성 설치**

Run:
```bash
cd "C:\Users\youja\Desktop\Neurocare" && npm install three@^0.185.1 @react-three/fiber@^9.7.0 @react-three/drei@^10.7.8
```
Expected: `package.json`의 `dependencies`에 세 패키지가 추가되고
`package-lock.json`이 갱신됨. React 19.2.4와 호환(`@react-three/fiber`
9.7.0의 peerDependency가 `react: ">=19 <19.3"`).

- [ ] **Step 2: 3D 에셋 다운로드**

Run:
```bash
mkdir -p "C:\Users\youja\Desktop\Neurocare\public\models"
curl -sL "https://static.poly.pizza/ba6d0ee3-bcc0-4ef0-9d3c-a3e245b41c77.glb" -o "C:\Users\youja\Desktop\Neurocare\public\models\dog.glb"
```
Expected: `public/models/dog.glb` 생성, 크기 약 851KB(`ls -la
public/models/dog.glb`로 확인, 800KB~900KB면 정상).

- [ ] **Step 3: 라이선스 출처 기록**

`public/models/dog.glb.LICENSE.txt` 생성:
```text
Model: Shiba Inu (Animated Animal Pack) by Quaternius
Source: https://poly.pizza/m/y4wdQpg767
License: CC0 1.0 (Public Domain)
```

- [ ] **Step 4: 커밋**

```bash
cd "C:\Users\youja\Desktop\Neurocare"
git add package.json package-lock.json public/models/dog.glb public/models/dog.glb.LICENSE.txt
git commit -m "feat: 강아지 3D 모델 에셋 + react-three-fiber 의존성 추가"
```

---

### Task 2: `DogMascotModel` — glTF 로드 + 애니메이션 클립 전환

**Files:**
- Create: `components/DogMascotModel.tsx`

**Interfaces:**
- Consumes: `public/models/dog.glb`(Task 1), `ConversationPhase`
  (`hooks/useConversationEngine.ts`).
- Produces: `DogMascotModel({ phase, userSpeaking, speakingLevel }):
  JSX.Element` — Task 3의 `DogMascot`이 이 컴포넌트를 `<Suspense>` 안에서
  렌더링한다. glTF 로드 실패 시 React 에러를 던진다(Suspense 상위의 에러
  바운더리가 처리, Task 3에서 구현).

- [ ] **Step 1: 컴포넌트 작성**

`components/DogMascotModel.tsx`:
```tsx
"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import type * as THREE from "three";
import type { ConversationPhase } from "@/hooks/useConversationEngine";

const MODEL_PATH = "/models/dog.glb";
const MODEL_SCALE = 1.6;
const MODEL_POSITION_Y = -1;
const CROSSFADE_SECONDS = 0.3;
const SPEAKING_CROSSFADE_SECONDS = 0.15;
const SPEAKING_TIMESCALE_BASE = 0.8;
const SPEAKING_TIMESCALE_RANGE = 0.6;
const SPEAKING_CLIPS = ["Idle_HitReact_Left", "Idle_HitReact_Right"] as const;

interface DogMascotModelProps {
  phase: ConversationPhase;
  userSpeaking: boolean;
  speakingLevel: number;
}

function getClipName(phase: ConversationPhase, userSpeaking: boolean): string {
  if (userSpeaking) return "Idle_2_HeadLow";
  if (phase === "thinking") return "Idle_2";
  if (phase === "speaking") return SPEAKING_CLIPS[0];
  return "Idle";
}

export function DogMascotModel({ phase, userSpeaking, speakingLevel }: DogMascotModelProps) {
  const group = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(MODEL_PATH);
  const { actions, mixer } = useAnimations(animations, group);
  const currentClipRef = useRef<string | null>(null);
  const speakingIndexRef = useRef(0);

  const isSpeaking = phase === "speaking" && !userSpeaking;
  const targetClip = useMemo(
    () => getClipName(phase, userSpeaking),
    [phase, userSpeaking],
  );

  const playClip = (name: string) => {
    if (currentClipRef.current === name) return;
    const prevAction: THREE.AnimationAction | undefined = currentClipRef.current
      ? actions[currentClipRef.current] ?? undefined
      : undefined;
    const nextAction = actions[name];
    prevAction?.fadeOut(CROSSFADE_SECONDS);
    nextAction?.reset().fadeIn(CROSSFADE_SECONDS).play();
    currentClipRef.current = name;
  };

  useEffect(() => {
    speakingIndexRef.current = 0;
    playClip(isSpeaking ? SPEAKING_CLIPS[0] : targetClip);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetClip, isSpeaking]);

  useEffect(() => {
    if (!isSpeaking) return undefined;
    const handleFinished = (event: { action: THREE.AnimationAction }) => {
      const finishedName = SPEAKING_CLIPS[speakingIndexRef.current];
      if (actions[finishedName] !== event.action) return;
      speakingIndexRef.current = (speakingIndexRef.current + 1) % SPEAKING_CLIPS.length;
      const nextName = SPEAKING_CLIPS[speakingIndexRef.current];
      actions[nextName]?.reset().fadeIn(SPEAKING_CROSSFADE_SECONDS).play();
      currentClipRef.current = nextName;
    };
    mixer.addEventListener("finished", handleFinished);
    return () => mixer.removeEventListener("finished", handleFinished);
  }, [isSpeaking, actions, mixer]);

  useFrame(() => {
    if (!isSpeaking || !currentClipRef.current) return;
    const action = actions[currentClipRef.current];
    if (!action) return;
    const clamped = Math.max(0, Math.min(1, speakingLevel));
    action.timeScale = SPEAKING_TIMESCALE_BASE + clamped * SPEAKING_TIMESCALE_RANGE;
  });

  return (
    <primitive
      ref={group}
      object={scene}
      scale={MODEL_SCALE}
      position={[0, MODEL_POSITION_Y, 0]}
    />
  );
}

useGLTF.preload(MODEL_PATH);
```

- [ ] **Step 2: 타입체크**

Run: `cd "C:\Users\youja\Desktop\Neurocare" && npx tsc --noEmit -p tsconfig.json`
Expected: 출력 없음.

- [ ] **Step 3: 린트**

Run: `npx eslint components/DogMascotModel.tsx`
Expected: 출력 없음. `react-hooks/exhaustive-deps` 경고가 뜨면 위 코드의
`eslint-disable-next-line` 주석이 해당 줄 바로 위에 있는지 확인(의도적으로
`playClip`을 deps에서 제외 — 매 렌더마다 새로 생성되는 함수라 deps에 넣으면
무한 루프).

- [ ] **Step 4: 커밋**

```bash
git add components/DogMascotModel.tsx
git commit -m "feat: 강아지 3D 모델 glTF 로드 + 애니메이션 클립 전환 컴포넌트"
```

---

### Task 3: `DogMascot` 교체 — Canvas/폴백/reduced-motion + CSS 정리

**Files:**
- Modify: `components/DogMascot.tsx` (전체 교체)
- Modify: `app/globals.css:86-148` (기존 `.dog-character` 2D 애니메이션 규칙 제거)

**Interfaces:**
- Consumes: `DogMascotModel`(Task 2).
- Produces: `DogMascot({ phase, userSpeaking, speakingLevel, viseme }):
  JSX.Element` — 시그니처는 기존과 동일, `app/page.tsx:149`의 호출부 변경
  없음.

- [ ] **Step 1: `components/DogMascot.tsx` 전체 교체**

```tsx
"use client";

import { Component, Suspense, useEffect, useState, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import type { ConversationPhase } from "@/hooks/useConversationEngine";
import { DogMascotModel } from "@/components/DogMascotModel";

interface DogMascotProps {
  phase: ConversationPhase;
  userSpeaking: boolean;
  speakingLevel: number;
  viseme: string;
}

interface ModelErrorBoundaryProps {
  onError: () => void;
  children: ReactNode;
}

class ModelErrorBoundary extends Component<ModelErrorBoundaryProps> {
  componentDidCatch(): void {
    this.props.onError();
  }

  render() {
    return this.props.children;
  }
}

function getLabel(phase: ConversationPhase, userSpeaking: boolean): string {
  if (userSpeaking) return "사용자의 말을 듣고 있는 뉴로케어 강아지";
  if (phase === "thinking") return "생각하고 있는 뉴로케어 강아지";
  if (phase === "speaking") return "말하고 있는 뉴로케어 강아지";
  return "준비 중인 뉴로케어 강아지";
}

function useStaticFallbackPreferred(loadFailed: boolean): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(query.matches);
    const handleChange = (event: MediaQueryListEvent) => setPrefersReducedMotion(event.matches);
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);

  return loadFailed || prefersReducedMotion;
}

export function DogMascot({ phase, userSpeaking, speakingLevel }: DogMascotProps) {
  const [loadFailed, setLoadFailed] = useState(false);
  const showStaticFallback = useStaticFallbackPreferred(loadFailed);
  const label = getLabel(phase, userSpeaking);

  if (showStaticFallback) {
    return (
      <div className="dog-character" aria-label={label} role="img">
        <img className="dog-character__fallback" src="/mascot-dog.png" alt="" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="dog-character" aria-label={label} role="img">
      <Canvas camera={{ position: [0, 1, 3], fov: 35 }} dpr={[1, 1.5]}>
        <ambientLight intensity={0.9} />
        <directionalLight position={[2, 4, 3]} intensity={1.1} />
        <Suspense fallback={null}>
          <ModelErrorBoundary onError={() => setLoadFailed(true)}>
            <DogMascotModel phase={phase} userSpeaking={userSpeaking} speakingLevel={speakingLevel} />
          </ModelErrorBoundary>
        </Suspense>
      </Canvas>
    </div>
  );
}
```

`viseme`는 `DogMascotProps`에 남겨서 `app/page.tsx`의 `viseme={engine.viseme}`
호출이 타입 에러 없이 그대로 컴파일되게 하되, 함수 시그니처에서 구조분해하지
않는다(사용 안 함 — 스펙에 명시된 결정).

- [ ] **Step 2: `app/globals.css`에서 옛 2D 애니메이션 규칙 제거**

`app/globals.css`의 다음 블록(현재 86~148번째 줄, `@keyframes dog-spark`부터
`prefers-reduced-motion` 미디어쿼리 끝까지) 전체를 삭제:
```css
@keyframes dog-spark {
  0%, 100% { opacity: 0; transform: translateY(4px) scale(0.7); }
  40%, 70% { opacity: 1; transform: translateY(-3px) scale(1); }
}

.dog-character { width: 18rem; height: 18rem; }
.dog-character__rig { position: relative; width: 100%; height: 100%; isolation: isolate; }
.dog-character__base { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; transform-origin: 50% 82%; will-change: transform; }
.dog-character__mouth { display: none; position: absolute; left: 50%; top: 56%; width: 8%; height: 5%; border: 2px solid #3d2a25; border-radius: 50%; background: #5c3134; transform-origin: center; }
.dog-character--speaking .dog-character__mouth:not(.dog-character__mouth--sil) { display: block; }
.dog-character__mouth--PP, .dog-character__mouth--FF { height: 2%; width: 7%; }
.dog-character__mouth--E, .dog-character__mouth--I { height: 3%; width: 10%; }
.dog-character__mouth--aa { height: 7%; width: 10%; }
.dog-character__mouth--O, .dog-character__mouth--U { height: 6%; width: 7%; }
.dog-character__thought { position: absolute; right: 14%; top: 10%; border-radius: 50%; background: var(--accent); opacity: 0; }
.dog-character__thought--small { width: .45rem; height: .45rem; right: 23%; top: 20%; }
.dog-character__thought--large { width: .8rem; height: .8rem; }
.dog-character--thinking .dog-character__thought { animation: dog-spark 1.8s ease-in-out infinite; }
.dog-character--idle .dog-character__base { animation: dog-character-breathe 3.4s ease-in-out infinite; }
.dog-character--listening .dog-character__base { animation: dog-character-listen 1.8s ease-in-out infinite; }
.dog-character--thinking .dog-character__base { animation: dog-character-think 2.4s ease-in-out infinite; }
.dog-character--speaking .dog-character__base { animation: dog-character-speak 1s ease-in-out infinite; }

@keyframes dog-tail-wag {
  0%, 100% { transform: rotate(-12deg); }
  50% { transform: rotate(22deg); }
}

@keyframes dog-arm-breathe {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-2px); }
}

@keyframes dog-character-breathe { 0%, 100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-1px) scale(1.008); } }
@keyframes dog-character-listen { 0%, 100% { transform: translateY(0) rotate(0); } 35% { transform: translateY(-2px) rotate(-1.2deg); } 70% { transform: translateY(0) rotate(0.6deg); } }
@keyframes dog-character-think { 0%, 100% { transform: translateY(0) rotate(0); } 50% { transform: translateY(-2px) rotate(1deg); } }
@keyframes dog-character-speak { 0%, 100% { transform: translateY(0) scale(1); } 35% { transform: translateY(-2px) scale(1.012); } 70% { transform: translateY(0) scale(0.998); } }

@keyframes dog-listen-paw {
  0%, 100% { transform: rotate(0deg); }
  50% { transform: rotate(12deg) translateY(-2px); }
}

@keyframes dog-think-paw {
  0%, 100% { transform: rotate(0deg); }
  50% { transform: rotate(18deg) translate(2px, -4px); }
}

@keyframes dog-talk-paw {
  0%, 100% { transform: rotate(0deg) translateY(0); }
  45% { transform: rotate(12deg) translateY(-4px); }
  70% { transform: rotate(-8deg) translateY(1px); }
}

@keyframes dog-ear-listen {
  from { transform: rotate(-5deg); }
  to { transform: rotate(8deg); }
}

@media (prefers-reduced-motion: reduce) {
  .dog-character * { animation: none !important; }
  .dog-character__mouth, .dog-character__thought { display: none !important; opacity: 0; }
}
```

그 자리에 아래로 교체:
```css
.dog-character { width: 18rem; height: 18rem; }
.dog-character canvas { border-radius: 0.75rem; }
.dog-character__fallback { width: 100%; height: 100%; object-fit: contain; }
```

- [ ] **Step 3: 타입체크 + 린트**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 출력 없음.

Run: `npx eslint components/DogMascot.tsx`
Expected: 출력 없음.

- [ ] **Step 4: 개발 서버로 수동 확인**

Run: `npm run dev`, 브라우저에서 홈 화면 접속.
확인 항목:
- 강아지 3D 모델이 렌더링되는지(카메라에 잡히는지). 모델이 너무 크거나
  작거나 화면 밖에 있으면 `components/DogMascotModel.tsx`의
  `MODEL_SCALE`/`MODEL_POSITION_Y`, `DogMascot.tsx`의 `camera.position`을
  조정하고 재확인(이 값들은 실제 렌더링 보고 눈으로 맞추는 값 — 최초
  추정치일 뿐).
- idle → (마이크에 대고 말해서) listening → thinking → speaking 전환 시
  클립이 자연스럽게 바뀌는지.
- speaking 상태에서 고개가 좌우로 번갈아 까딱이는지.
- 브라우저 devtools에서 OS 수준 "모션 감소" 설정을 켰을 때(또는
  `prefers-reduced-motion: reduce`를 devtools rendering 탭에서 강제)
  정지 PNG로 전환되는지.
- `public/models/dog.glb` 경로를 일부러 오타 내서(예:
  `MODEL_PATH`를 `/models/dog-typo.glb`로) 새로고침 시 PNG 폴백이 뜨는지
  확인 후 오타 원복.

- [ ] **Step 5: 커밋**

```bash
git add components/DogMascot.tsx app/globals.css
git commit -m "feat: 강아지 마스코트를 3D 스켈레톤 애니메이션으로 교체"
```
