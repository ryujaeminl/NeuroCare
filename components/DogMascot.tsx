"use client";

import type { ConversationPhase } from "@/hooks/useConversationEngine";

interface DogMascotProps {
  phase: ConversationPhase;
  userSpeaking: boolean;
  speakingLevel: number;
  viseme: string;
}

function getMotion(phase: ConversationPhase, userSpeaking: boolean): string {
  if (userSpeaking) return "dog-character--listening";
  if (phase === "thinking") return "dog-character--thinking";
  if (phase === "speaking") return "dog-character--speaking";
  return "dog-character--idle";
}

function getLabel(phase: ConversationPhase, userSpeaking: boolean): string {
  if (userSpeaking) return "사용자의 말을 듣고 있는 뉴로케어 강아지";
  if (phase === "thinking") return "생각하고 있는 뉴로케어 강아지";
  if (phase === "speaking") return "말하고 있는 뉴로케어 강아지";
  return "준비 중인 뉴로케어 강아지";
}

export function DogMascot({ phase, userSpeaking, speakingLevel, viseme }: DogMascotProps) {
  const mouthScale = 0.7 + Math.max(0, Math.min(1, speakingLevel)) * 1.1;
  const mouthClass = `dog-character__mouth dog-character__mouth--${viseme.replace("viseme_", "")}`;

  return (
    <div className="dog-character" aria-label={getLabel(phase, userSpeaking)} role="img">
      <div className={`dog-character__rig ${getMotion(phase, userSpeaking)}`}>
        <img className="dog-character__base" src="/mascot-dog.png" alt="" aria-hidden="true" />
        <span className={mouthClass} style={{ transform: `translate(-50%, -50%) scaleY(${mouthScale})` }} aria-hidden="true" />
        <span className="dog-character__thought dog-character__thought--small" aria-hidden="true" />
        <span className="dog-character__thought dog-character__thought--large" aria-hidden="true" />
      </div>
    </div>
  );
}
