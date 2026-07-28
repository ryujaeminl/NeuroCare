"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface OpenEvent {
  id: string;
  triggerType: string;
  createdAt: string;
  patient: { name: string };
}

const POLL_MS = 20_000;

/** 보호자 화면 어디서나 미확인 긴급 이벤트가 있으면 눈에 띄게 알린다. */
export function EmergencyBanner() {
  const [events, setEvents] = useState<OpenEvent[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const response = await fetch("/api/emergency");
        const data = await response.json();
        if (!cancelled && response.ok) setEvents(data.events ?? []);
      } catch {
        // 배너는 참고용이라 실패해도 조용히 넘어간다.
      }
    }
    void poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (events.length === 0) return null;

  return (
    <div className="border-b-2 border-rose-500 bg-danger-bg px-4 py-3 sm:px-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-2">
        {events.map((event) => (
          <Link
            key={event.id}
            href={`/guardian/emergency/${event.id}`}
            className="flex items-center justify-between gap-3 text-sm font-medium text-rose-100"
          >
            <span>
              🆘 {event.patient.name}님에게 긴급 상황이 발생했습니다 ({new Date(event.createdAt).toLocaleTimeString("ko-KR")})
            </span>
            <span className="shrink-0 underline">확인하기 →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
