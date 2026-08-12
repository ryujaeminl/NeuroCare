"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import * as THREE from "three";
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
