"use client";

import { useState } from "react";

/**
 * 환자 화면에서 가장 확실하고 구현이 쉬운 긴급 트리거 - 눌리면 연동된 보호자 전원에게
 * 즉시 알림이 간다(우려되는 신호 감지 같은 자동 트리거보다 오탐 걱정이 없다).
 */
export function EmergencyButton() {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function handleClick() {
    if (status === "sending") return;
    if (!confirm("보호자에게 긴급 알림을 보낼까요?")) return;

    setStatus("sending");
    try {
      const response = await fetch("/api/emergency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ triggerType: "manual_button" }),
      });
      setStatus(response.ok ? "sent" : "error");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      {status === "sent" && (
        <p className="rounded-full bg-emerald-500/90 px-4 py-2 text-sm font-medium text-white shadow-lg">
          보호자에게 알림을 보냈어요
        </p>
      )}
      {status === "error" && (
        <p className="rounded-full bg-rose-500/90 px-4 py-2 text-sm font-medium text-white shadow-lg">
          전송에 실패했어요. 다시 시도해주세요
        </p>
      )}
      <button
        type="button"
        onClick={handleClick}
        disabled={status === "sending"}
        aria-label="긴급 호출"
        className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-500 text-2xl text-white shadow-lg transition hover:brightness-110 disabled:opacity-60"
      >
        🆘
      </button>
    </div>
  );
}
