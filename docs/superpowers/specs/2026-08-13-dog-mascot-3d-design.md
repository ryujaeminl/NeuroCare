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

**에셋 조사 결과**: [Quaternius Shiba Inu](https://poly.pizza/m/y4wdQpg767)
(Poly Pizza, CC0, glTF)를 실제로 다운로드해 확인함 — 애니메이션 클립
`Idle`/`Idle_2`/`Idle_2_HeadLow`/`Idle_HitReact_Left`/`Idle_HitReact_Right`/
`Walk`/`Attack`/`Death`/`Eating`/`Gallop`/`Gallop_Jump`/`Jump_ToIdle` 보유,
스킨 1개. 색상은 갈색 계열(`Main` 머티리얼 baseColor ≈ RGB
0.25/0.13/0.04) — 골든리트리버에 근접, 별도 보정 불필요. **morph target
없음, 입/턱 전용 뼈도 없음**(최소 단위가 `Head`) — 즉 이 에셋으론 viseme
정밀 입모양도 턱 폴백도 불가능. 얼굴 리깅 있는 무료 CC0 강아지 에셋을
추가로 찾아봤으나 없음(Meshy.ai 등은 AI 자동 리깅이라 품질 불안정 — 이미
설계 논의에서 배제한 옵션과 동일 사유로 제외). 사용자 확인 하에 이 에셋으로
확정하고 진행한다.

## 목표 / 범위

- `DogMascot` 컴포넌트를 react-three-fiber 기반 3D 렌더링으로 교체.
- 에셋: Quaternius Shiba Inu glTF (`https://static.poly.pizza/ba6d0ee3-bcc0-4ef0-9d3c-a3e245b41c77.glb`,
  CC0). 색상 보정 불필요.
- 기존 4개 phase(idle/listening/thinking/speaking)를 아래 클립으로 매핑,
  phase 전환 시 크로스페이드:
  - idle → `Idle`
  - listening(`userSpeaking`) → `Idle_2_HeadLow` (고개 숙이고 듣는 자세)
  - thinking → `Idle_2` (고개 갸웃)
  - speaking → `Idle_HitReact_Left`/`Idle_HitReact_Right` 번갈아 재생(고개
    좌우로 까딱 — 입 움직임 없이 "말하는 느낌"을 주는 저폴리 대체 표현)
- viseme 립싱크는 이 에셋에 대응 수단(morph target/턱 뼈)이 없어 **범위
  밖**(아래 참고). `speakingLevel`은 speaking 상태의 클립 재생 속도
  (`action.timeScale`)를 스케일하는 데만 사용 — 크게 말할수록 고개 까딱임이
  약간 빨라짐.
- 외부 인터페이스(`DogMascotProps`: `phase`, `userSpeaking`, `speakingLevel`,
  `viseme`)는 그대로 유지 — `app/page.tsx` 등 호출부 변경 없음. `viseme`
  prop은 이번 스펙에서 안 씀(다음 스펙에서 얼굴 리깅 있는 에셋으로 교체될
  때를 대비해 인터페이스만 유지).

## 범위 밖

- **viseme 음소별 입모양 립싱크** — 선정한 에셋에 morph target도 턱 뼈도
  없어 구현 불가능. 기존 2D 버전의 입 모양 오버레이(`dog-character__mouth`)
  기능은 이번 교체로 사라진다(알려진 다운그레이드로 명시, 사용자 확인 완료).
- 흰 가운·청진기·"Neurocare" 배지 등 커스텀 의상 재현 — 일반 리깅 에셋
  한계로 색상 근사까지만 하고 의상은 범위 밖(필요하면 이후 커스텀 3D
  모델링/AI 이미지→3D 생성으로 별도 스펙).
- 음악 재생 중 춤/댄스 전용 모션 — 이번 스펙은 기존 4개 상태만 다룬다. 필요해
  지면 별도 스펙으로 확장.
- AI로 3D 모델 자체를 생성하는 것 — 무료 리깅 에셋을 찾아 쓴다(설계 논의에서
  결정, 얼굴 리깅 있는 에셋 재조사도 무료로는 못 찾음).
- 서버사이드 렌더링/프리렌더 최적화 — 클라이언트 사이드 Canvas 렌더링만 다룸.
- 자동 시각 회귀 테스트 — 3D 렌더링 특성상 실기기/브라우저 수동 확인으로
  대체(아래 테스트 계획 참고).

## 아키텍처

```
DogMascot (외피)
  ├─ <Canvas> (react-three-fiber, 카메라/조명 셋업, 고정 크기 18rem×18rem)
  │    └─ <Suspense fallback={<정지 PNG 폴백>}>
  │         └─ DogMascotModel (glTF 로드 + 애니메이션 재생)
  └─ phase/userSpeaking/speakingLevel props → DogMascotModel로 전달
     (viseme prop은 인터페이스 유지 목적으로만 받고 안 씀)
```

- `phase`/`userSpeaking` → `getMotion()`(기존 로직 재사용, 반환값만 CSS
  클래스명 대신 클립 이름으로 변경)으로 클립 이름 결정 →
  `useAnimations`의 `actions[name].reset().fadeIn(0.3).play()`, 이전
  액션은 `.fadeOut(0.3)`. speaking은 `Idle_HitReact_Left`/`Right`를
  클립이 끝날 때마다(`mixer`의 `finished` 이벤트) 번갈아 트리거.
- `speakingLevel` → speaking 상태일 때만 현재 액션의 `timeScale`을
  `0.8 + clamp(speakingLevel, 0, 1) * 0.6`로 갱신(크게 말할수록 고개
  까딱임이 살짝 빨라짐).
- glTF 로드 실패(네트워크 오류 등) 시 `Suspense`가 아니라 `useGLTF`의 에러를
  잡아 기존 `public/mascot-dog.png` 정지 이미지로 폴백 렌더.

### 컴포넌트

- **`public/models/dog.glb`** (신규 에셋): Quaternius Shiba Inu
  (`https://static.poly.pizza/ba6d0ee3-bcc0-4ef0-9d3c-a3e245b41c77.glb`,
  CC0, 851KB). 클립: `Idle`, `Idle_2`, `Idle_2_HeadLow`,
  `Idle_HitReact_Left`, `Idle_HitReact_Right`, `Walk`, `Attack`, `Death`,
  `Eating`, `Gallop`, `Gallop_Jump`, `Jump_ToIdle`(이 중 4개만 사용).
- **`components/DogMascot.tsx`** (교체): Canvas/Suspense/카메라/조명 셋업.
  기존 `getMotion()`/`getLabel()` 함수, `aria-label`/`role="img"` 접근성
  속성 유지(3D 캔버스에도 동일하게 적용).
- **`components/DogMascotModel.tsx`** (신규): `useGLTF("/models/dog.glb")` +
  `useAnimations`로 클립 재생, speaking 상태의 좌우 클립 교대 + timeScale
  갱신 로직.
- **`package.json`** (수정): `three`, `@react-three/fiber`, `@react-three/drei`
  의존성 추가.

## 에러 처리

- glTF 로드 실패 → `mascot-dog.png` 정지 이미지로 폴백(완전히 마스코트가
  안 보이는 상황 방지).

## 테스트 계획

- `npx tsc --noEmit`, `npx eslint components/DogMascot.tsx
  components/DogMascotModel.tsx` — 기존 저장소 관례.
- 수동 확인(핵심 리스크, 자동화 어려움):
  - 4개 phase 전환 시 클립이 자연스럽게 크로스페이드 되는지.
  - speaking 상태에서 좌우 HitReact가 번갈아 재생되며 `speakingLevel`에
    따라 속도가 미세하게 변하는지.
  - Android WebView(폰, 저사양 가능성)에서 프레임 드랍 없이 부드럽게
    돌아가는지 — 실기기 또는 CPU throttling 크롬 devtools로 확인.
  - glTF 로드를 의도적으로 실패시켜(경로 오타 등) PNG 폴백이 제대로
    뜨는지.
