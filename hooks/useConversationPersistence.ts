"use client";

import { useCallback, useEffect, useRef } from "react";

/** 마지막 턴 이후 이 시간만큼 조용하면 기분을 분석한다. */
const MOOD_ANALYSIS_IDLE_MS = 20_000;

export interface ConversationPersistence {
  /** 확정된 턴을 저장한다. 실패해도 대화는 계속되어야 하므로 예외를 던지지 않는다. */
  saveTurn: (role: "user" | "assistant", text: string) => void;
  /** 세션을 닫고 기분 분석을 트리거한다. */
  endSession: () => void;
}

/**
 * 대화 내용을 서버에 저장하는 부수효과만 담당한다.
 * 음성 파이프라인(VAD/턴종료/TTS/barge-in)과 분리해 두어, 저장이 실패하거나
 * 로그인이 안 된 상태여도 대화 자체는 그대로 동작하게 한다.
 */
export function useConversationPersistence(enabled: boolean): ConversationPersistence {
  const sessionIdRef = useRef<string | null>(null);
  // 세션 생성이 끝나기 전에 턴이 확정될 수 있으므로, 생성 Promise를 붙잡아 순서를 보장한다.
  const sessionPromiseRef = useRef<Promise<string | null> | null>(null);
  const moodTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ensureSession = useCallback(async (): Promise<string | null> => {
    if (!enabled) return null;
    if (sessionIdRef.current) return sessionIdRef.current;

    sessionPromiseRef.current ??= (async () => {
      try {
        const response = await fetch("/api/sessions", { method: "POST" });
        if (!response.ok) return null;
        const data = (await response.json()) as { session?: { id?: string } };
        sessionIdRef.current = data.session?.id ?? null;
        return sessionIdRef.current;
      } catch {
        return null;
      }
    })();

    return sessionPromiseRef.current;
  }, [enabled]);

  useEffect(() => {
    if (enabled) void ensureSession();
  }, [enabled, ensureSession]);

  /**
   * 대화가 잠시 멎으면 그때까지의 내용으로 기분을 다시 분석한다.
   * 매 턴마다 돌리면 LLM 호출이 과해지고, 세션 종료 때만 돌리면 대화 중에는 화면에
   * 아무것도 안 뜬다. 마지막 턴 이후 조용해진 시점 한 번만 돌리는 게 균형점이다.
   */
  const scheduleMoodAnalysis = useCallback((sessionId: string) => {
    if (moodTimerRef.current) clearTimeout(moodTimerRef.current);
    moodTimerRef.current = setTimeout(() => {
      void fetch("/api/mood", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      }).catch(() => undefined);
    }, MOOD_ANALYSIS_IDLE_MS);
  }, []);

  const saveTurn = useCallback(
    (role: "user" | "assistant", text: string) => {
      if (!enabled || !text.trim()) return;
      void (async () => {
        const sessionId = await ensureSession();
        if (!sessionId) return;
        try {
          await fetch("/api/turns", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId, role, text }),
          });
          // AI 응답까지 끝난 시점을 한 턴의 끝으로 본다.
          if (role === "assistant") scheduleMoodAnalysis(sessionId);
        } catch {
          // 저장 실패는 대화 흐름을 막지 않는다.
        }
      })();
    },
    [enabled, ensureSession, scheduleMoodAnalysis],
  );

  const endSession = useCallback(() => {
    const sessionId = sessionIdRef.current;
    if (!enabled || !sessionId) return;

    const payload = JSON.stringify({ sessionId, final: true });
    // 탭을 닫는 중이면 일반 fetch는 취소되므로 sendBeacon으로 보낸다.
    if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
      navigator.sendBeacon("/api/mood", new Blob([payload], { type: "application/json" }));
      return;
    }
    void fetch("/api/mood", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => undefined);
  }, [enabled]);

  // 탭을 닫거나 화면을 벗어날 때 세션을 마무리한다.
  useEffect(() => {
    if (!enabled) return;
    const handleUnload = () => endSession();
    const clearMoodTimer = () => { if (moodTimerRef.current) clearTimeout(moodTimerRef.current); };
    window.addEventListener("pagehide", handleUnload);
    return () => {
      window.removeEventListener("pagehide", handleUnload);
      clearMoodTimer();
      endSession();
    };
  }, [enabled, endSession]);

  return { saveTurn, endSession };
}
