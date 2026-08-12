"use client";

import type { ConversationPhase } from "@/hooks/useConversationEngine";

interface DogMascotProps {
  phase: ConversationPhase;
  userSpeaking: boolean;
}

function getMotion(phase: ConversationPhase, userSpeaking: boolean): string {
  if (userSpeaking) return "dog-svg--listening";
  if (phase === "thinking") return "dog-svg--thinking";
  if (phase === "speaking") return "dog-svg--speaking";
  return "dog-svg--idle";
}

function getLabel(phase: ConversationPhase, userSpeaking: boolean): string {
  if (userSpeaking) return "환자 말씀을 듣고 있어요";
  if (phase === "thinking") return "대답을 생각하고 있어요";
  if (phase === "speaking") return "대답하고 있어요";
  return "대화할 준비가 되어 있어요";
}

export function DogMascot({ phase, userSpeaking }: DogMascotProps) {
  return (
    <div className="dog-svg" aria-label={getLabel(phase, userSpeaking)} role="img">
      <svg viewBox="0 0 240 220" className={`dog-svg__scene ${getMotion(phase, userSpeaking)}`} aria-hidden="true">
        <ellipse className="dog-svg__shadow" cx="120" cy="204" rx="62" ry="9" />
        <path className="dog-svg__tail" d="M177 157 C222 160 216 111 190 119" />
        <g className="dog-svg__body">
          <ellipse className="dog-svg__body-fill" cx="120" cy="157" rx="57" ry="48" />
          <ellipse className="dog-svg__belly" cx="120" cy="169" rx="35" ry="28" />
          <path className="dog-svg__leg" d="M87 178v23M153 178v23" />
        </g>
        <g className="dog-svg__head">
          <path className="dog-svg__ear dog-svg__ear--left" d="M74 63 C39 48 37 91 69 111Z" />
          <path className="dog-svg__ear dog-svg__ear--right" d="M166 63 C201 48 203 91 171 111Z" />
          <rect className="dog-svg__head-fill" x="64" y="42" width="112" height="104" rx="50" />
          <ellipse className="dog-svg__muzzle" cx="120" cy="111" rx="39" ry="27" />
          <g className="dog-svg__eyes">
            <ellipse cx="92" cy="91" rx="7" ry="9" />
            <ellipse cx="148" cy="91" rx="7" ry="9" />
          </g>
          <path className="dog-svg__nose" d="M112 106 Q120 100 128 106 Q127 116 120 118 Q113 116 112 106Z" />
          <path className="dog-svg__mouth dog-svg__mouth--closed" d="M120 117v8M120 125q-9 8-17 0M120 125q9 8 17 0" />
          <ellipse className="dog-svg__mouth dog-svg__mouth--open" cx="120" cy="132" rx="15" ry="12" />
          <path className="dog-svg__tongue" d="M113 133q7 14 14 0" />
          <circle className="dog-svg__cheek dog-svg__cheek--left" cx="79" cy="117" r="7" />
          <circle className="dog-svg__cheek dog-svg__cheek--right" cx="161" cy="117" r="7" />
        </g>
        <g className="dog-svg__thoughts">
          <circle cx="189" cy="47" r="4" />
          <circle cx="201" cy="32" r="7" />
        </g>
      </svg>
    </div>
  );
}
