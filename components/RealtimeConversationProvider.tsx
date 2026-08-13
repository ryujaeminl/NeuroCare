"use client";

import { createContext, useContext } from "react";
import { useSession } from "next-auth/react";
import { useRealtimeConversation } from "@/hooks/useRealtimeConversation";
import type { UseConversationEngineResult } from "@/hooks/useConversationEngine";

const RealtimeConversationContext = createContext<UseConversationEngineResult | null>(null);

/**
 * 대화 연결(WebRTC/마이크)을 루트 레이아웃에서 한 번만 만든다 - 예전엔 app/page.tsx가
 * 직접 useRealtimeConversation을 불러서, 다른 화면(추억/기록/계정)으로 이동하면
 * page.tsx가 언마운트되며 연결이 통째로 끊겼다("다른 창으로 이동해도 대화가 이어졌으면
 * 좋겠다"는 요청과 정확히 반대 동작). 여기서 한 번 붙이고 각 페이지는 컨텍스트로
 * 구독만 하면, 화면을 옮겨도 같은 WebRTC 연결이 그대로 유지된다.
 */
export function RealtimeConversationProvider({ children }: { children: React.ReactNode }) {
  const { status, data: session } = useSession();
  const enabled = status === "authenticated" && session?.user?.role === "patient";
  const engine = useRealtimeConversation(enabled);

  return (
    <RealtimeConversationContext.Provider value={engine}>{children}</RealtimeConversationContext.Provider>
  );
}

export function useRealtimeConversationContext(): UseConversationEngineResult {
  const engine = useContext(RealtimeConversationContext);
  if (!engine) {
    throw new Error("useRealtimeConversationContext는 RealtimeConversationProvider 안에서만 쓸 수 있습니다.");
  }
  return engine;
}
