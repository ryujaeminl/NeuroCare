"use client";

import { Component, Suspense, useState, useSyncExternalStore, type ReactNode } from "react";
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

function subscribeToReducedMotion(callback: () => void): () => void {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function getReducedMotionSnapshot(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getReducedMotionServerSnapshot(): boolean {
  return false;
}

function useStaticFallbackPreferred(loadFailed: boolean): boolean {
  const prefersReducedMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot,
  );

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
