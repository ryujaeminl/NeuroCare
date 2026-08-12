# 강아지 마스코트 3D 스켈레톤 애니메이션 설계

## 배경

`components/DogMascot.tsx`는 현재 PNG 한 장(`public/mascot-dog.png`)을 CSS
transform(이동/회전/스케일)으로 흔드는 방식이다. 4개 phase(idle/listening/
thinking/speaking)마다 keyframe 애니메이션이 있고, 말할 때는 `viseme` 문자열에
따라 입 모양 span을 오버레이한다(`hooks/useRealtimeConversation.ts`의
wawa-lipsync 연동). 이 방식은 이미지 전체가 통째로 움직여서 "숨쉬는" 느낌은
나지만 머리/몸통/다리/꼬리가 따로 움직이는 진짜 캐릭터 애니메이션처럼 보이지
않는다. 이 스펙은 마스코트를 3D 모델 + 스켈레톤 애니메이션으로 교체한다.

현재 `mascot-dog.png`는 흰 가운 + 청진기 + "Neurocare" 배지를 입은 커스텀
디자인 골든리트리버 캐릭터다. 이 정확한 의상까지 갖춘 무료 리깅 3D 에셋은
존재하지 않는다 — 설계 논의에서 "일반 리깅 강아지 모델 + 색상/재질만
비슷하게 맞춤(가운·청진기·배지 없이 골든리트리버 색상 위주로 근사)"으로
합의했다. 즉 이번 교체로 실루엣/디테일이 100% 동일하진 않고, "골든리트리버
색상의 움직이는 3D 강아지"가 목표다.

## 목표 / 범위

- `DogMascot` 컴포넌트를 react-three-fiber 기반 3D 렌더링으로 교체.
- 무료 리깅된 glTF 강아지 모델(에셋 사이트에서 조달), 골든리트리버 색상/
  재질에 가까운 것을 우선 선정. 필요하면 텍스처 색상만 보정.
- 기존 4개 phase(idle/listening/thinking/speaking)에 대응하는 스켈레톤
  애니메이션 클립 재생, phase 전환 시 크로스페이드.
- 기존 viseme 립싱크(음소별 입모양)를 모델이 지원하면(morph target 있으면)
  유지, 없으면 턱 뼈 열림/닫힘으로 단순화.
- 외부 인터페이스(`DogMascotProps`: `phase`, `userSpeaking`, `speakingLevel`,
  `viseme`)는 그대로 유지 — `app/page.tsx` 등 호출부 변경 없음.

## 범위 밖

- 흰 가운·청진기·"Neurocare" 배지 등 커스텀 의상 재현 — 일반 리깅 에셋
  한계로 색상 근사까지만 하고 의상은 범위 밖(필요하면 이후 커스텀 3D
  모델링/AI 이미지→3D 생성으로 별도 스펙).
- 음악 재생 중 춤/댄스 전용 모션 — 이번 스펙은 기존 4개 상태만 다룬다. 필요해
  지면 별도 스펙으로 확장.
- AI로 3D 모델 자체를 생성하는 것 — 무료 리깅 에셋을 찾아 쓴다(설계 논의에서
  결정).
- 서버사이드 렌더링/프리렌더 최적화 — 클라이언트 사이드 Canvas 렌더링만 다룸.
- 자동 시각 회귀 테스트 — 3D 렌더링 특성상 실기기/브라우저 수동 확인으로
  대체(아래 테스트 계획 참고).

## 아키텍처

```
DogMascot (외피)
  ├─ <Canvas> (react-three-fiber, 카메라/조명 셋업, 고정 크기 18rem×18rem)
  │    └─ <Suspense fallback={<정지 PNG 폴백>}>
  │         └─ DogMascotModel (glTF 로드 + 애니메이션 재생 + 립싱크 적용)
  └─ phase/userSpeaking/speakingLevel/viseme props → DogMascotModel로 전달
```

- `phase`/`userSpeaking` → `getMotion()`(기존 로직 재사용)으로 클립 이름
  결정 → `useAnimations`의 `actions[name].reset().fadeIn(0.3).play()`,
  이전 액션은 `.fadeOut(0.3)`.
- `viseme`/`speakingLevel` → 매 프레임(`useFrame`) 모델의 입 관련 morph
  target weight를 갱신. morph target이 없는 모델이면 턱 본 회전으로 폴백
  (에셋 선정 단계에서 morph target 유무 확인, 있는 걸 우선 채택).
- glTF 로드 실패(네트워크 오류 등) 시 `Suspense`가 아니라 `useGLTF`의 에러를
  잡아 기존 `public/mascot-dog.png` 정지 이미지로 폴백 렌더.

### 컴포넌트

- **`public/models/dog.glb`** (신규 에셋): 무료 리깅 강아지 glTF, 골든리트리버
  색상/재질에 가까운 것 우선 선정(의상 없음, 색상만 근사). Idle/Listen/Think/
  Talk 4개 애니메이션 클립 포함(에셋에 없는 클립은 가장 가까운 클립으로 대체
  매핑 — 예: Talk 클립 없으면 Idle을 더 빠른 재생속도로 대용).
- **`components/DogMascot.tsx`** (교체): Canvas/Suspense/카메라/조명 셋업.
  기존 `getMotion()`/`getLabel()` 함수, `aria-label`/`role="img"` 접근성
  속성 유지(3D 캔버스에도 동일하게 적용).
- **`components/DogMascotModel.tsx`** (신규): `useGLTF("/models/dog.glb")` +
  `useAnimations`로 클립 재생, `useFrame`으로 매 프레임 립싱크 morph target
  갱신.
- **`package.json`** (수정): `three`, `@react-three/fiber`, `@react-three/drei`
  의존성 추가.

## 에러 처리

- glTF 로드 실패 → `mascot-dog.png` 정지 이미지로 폴백(완전히 마스코트가
  안 보이는 상황 방지).
- 선정한 에셋에 4개 클립이 다 없는 경우 → 있는 클립으로 대체 매핑(위 참고),
  존재하지 않는 phase는 콘솔 경고 없이 조용히 폴백(사용자에게 에러로
  노출되는 상황이 아니므로).
- morph target 없는 에셋 → 턱 본 폴백으로 자동 전환, 별도 에러 처리 불필요.

## 테스트 계획

- `npx tsc --noEmit`, `npx eslint components/DogMascot.tsx
  components/DogMascotModel.tsx` — 기존 저장소 관례.
- 수동 확인(핵심 리스크, 자동화 어려움):
  - 4개 phase 전환 시 클립이 자연스럽게 크로스페이드 되는지.
  - `viseme` 값 변화에 따라 입이 실제로 움직이는지(모델에 morph target
    있는 경우) / 턱이 열리고 닫히는지(폴백인 경우).
  - Android WebView(폰, 저사양 가능성)에서 프레임 드랍 없이 부드럽게
    돌아가는지 — 실기기 또는 CPU throttling 크롬 devtools로 확인.
  - glTF 로드를 의도적으로 실패시켜(경로 오타 등) PNG 폴백이 제대로
    뜨는지.
