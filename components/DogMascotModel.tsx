"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { ConversationPhase } from "@/hooks/useConversationEngine";

const MODEL_PATH = "/models/dog.glb";
const CROSSFADE_SECONDS = 0.3;
const SPEAKING_CROSSFADE_SECONDS = 0.15;
const SPEAKING_TIMESCALE_BASE = 0.8;
const SPEAKING_TIMESCALE_RANGE = 0.6;
const SPEAKING_CLIPS = ["Idle_HitReact_Left", "Idle_HitReact_Right"] as const;

const COAT_NAME = "doctor-coat";
const STETHOSCOPE_NAME = "doctor-stethoscope";
const COAT_COLOR = "#f5f3ec";
const STETHOSCOPE_COLOR = "#2b2b2b";

// 리깅된 무료 강아지 에셋엔 흰 가운/청진기가 없어서, 전체 모델 바운딩박스
// 비율에 맞춰 단순 도형(원통/토러스)을 만들어 씬에 한 번 붙인다 - 정교한
// 의상은 아니고 "의사 강아지"로 읽히게 하는 최소 장식. 뼈가 아니라 씬
// 루트에 고정 배치(현재 애니메이션은 몸통 위치가 거의 안 바뀌는 idle류라
// 뼈 추적 없이도 눈에 띄게 어긋나지 않는다).
function addDoctorAccessories(scene: THREE.Object3D): void {
  if (scene.getObjectByName(COAT_NAME)) return;

  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const coat = new THREE.Mesh(
    new THREE.CylinderGeometry(size.x * 0.32, size.x * 0.4, size.y * 0.42, 16),
    new THREE.MeshStandardMaterial({ color: COAT_COLOR, roughness: 0.85 }),
  );
  coat.name = COAT_NAME;
  coat.position.set(center.x, box.min.y + size.y * 0.42, center.z);
  scene.add(coat);

  const stethoscope = new THREE.Mesh(
    new THREE.TorusGeometry(size.x * 0.22, size.x * 0.045, 8, 20),
    new THREE.MeshStandardMaterial({ color: STETHOSCOPE_COLOR, roughness: 0.5 }),
  );
  stethoscope.name = STETHOSCOPE_NAME;
  stethoscope.rotation.x = Math.PI / 2;
  stethoscope.position.set(center.x, box.min.y + size.y * 0.78, box.max.z - size.z * 0.05);
  scene.add(stethoscope);
}

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

  // useMemo(render 단계)에서 실행 - Bounds의 자동 프레이밍(부모 컴포넌트,
  // 마운트 시 effect에서 씬 바운딩박스를 계산)보다 반드시 먼저 씬 그래프에
  // 붙어있어야 가운/청진기까지 포함해서 카메라가 맞춰진다.
  useMemo(() => addDoctorAccessories(scene), [scene]);

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
    nextAction?.reset();
    if (SPEAKING_CLIPS.includes(name as (typeof SPEAKING_CLIPS)[number])) {
      nextAction?.setLoop(THREE.LoopOnce, 1);
    }
    nextAction?.fadeIn(CROSSFADE_SECONDS).play();
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
      actions[nextName]
        ?.reset()
        .setLoop(THREE.LoopOnce, 1)
        .fadeIn(SPEAKING_CROSSFADE_SECONDS)
        .play();
      currentClipRef.current = nextName;
    };
    mixer.addEventListener("finished", handleFinished);
    return () => mixer.removeEventListener("finished", handleFinished);
  }, [isSpeaking, actions, mixer]);

  // eslint-disable-next-line react-hooks/immutability -- useFrame is r3f's imperative escape hatch; mutating the three.js AnimationAction here (not React state) is the documented pattern for per-frame updates outside React's render cycle.
  useFrame(() => {
    if (!isSpeaking || !currentClipRef.current) return;
    const action = actions[currentClipRef.current];
    if (!action) return;
    const clamped = Math.max(0, Math.min(1, speakingLevel));
    // eslint-disable-next-line react-hooks/immutability -- useFrame is r3f's imperative escape hatch for per-frame three.js mutations.
    action.timeScale = SPEAKING_TIMESCALE_BASE + clamped * SPEAKING_TIMESCALE_RANGE;
  });

  return <primitive ref={group} object={scene} />;
}

useGLTF.preload(MODEL_PATH);
