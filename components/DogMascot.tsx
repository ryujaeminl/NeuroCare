"use client";

import type { ConversationPhase } from "@/hooks/useConversationEngine";

interface DogMascotProps {
  phase: ConversationPhase;
  userSpeaking: boolean;
}

function getMotion(phase: ConversationPhase, userSpeaking: boolean): string {
  if (userSpeaking) return "dog-mascot--listening";
  if (phase === "thinking") return "dog-mascot--thinking";
  if (phase === "speaking") return "dog-mascot--speaking";
  return "dog-mascot--idle";
}

function getLabel(phase: ConversationPhase, userSpeaking: boolean): string {
  if (userSpeaking) return "환자 말씀을 듣고 있어요";
  if (phase === "thinking") return "대답을 생각하고 있어요";
  if (phase === "speaking") return "대답하고 있어요";
  return "대화할 준비가 되어 있어요";
}

export function DogMascot({ phase, userSpeaking }: DogMascotProps) {
  return (
    <div className="dog-mascot" data-phase={phase} aria-label={getLabel(phase, userSpeaking)} role="img">
      <div className={`dog-mascot__stage ${getMotion(phase, userSpeaking)}`}>
        <div className="dog-mascot__shadow" aria-hidden="true" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/mascot-dog.png" alt="" className="dog-mascot__image" />
        <span className="dog-mascot__spark dog-mascot__spark--one" aria-hidden="true">✦</span>
        <span className="dog-mascot__spark dog-mascot__spark--two" aria-hidden="true">·</span>
      </div>
    </div>
  );
}
