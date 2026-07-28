"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

interface EmergencyEventDetail {
  id: string;
  patientId: string;
  triggerType: string;
  detail: string | null;
  status: string;
  acknowledgedByName: string | null;
  acknowledgedAt: string | null;
  createdAt: string;
  patient: { name: string };
}

const TRIGGER_LABELS: Record<string, string> = {
  voice_distress: "대화 중 도움을 요청하는 말을 했습니다",
  manual_button: "긴급 호출 버튼을 눌렀습니다",
  session_timeout: "대화가 응답 없이 중단되었습니다",
  mood_critical: "정서 상태가 심각하게 우려됩니다",
};

async function fetchEmergencyEvent(eventId: string): Promise<EmergencyEventDetail> {
  const response = await fetch(`/api/emergency/${eventId}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "이벤트를 불러오지 못했습니다.");
  return data.event;
}

export default function EmergencyEventPage() {
  const params = useParams<{ eventId: string }>();
  const [event, setEvent] = useState<EmergencyEventDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [acking, setAcking] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const event = await fetchEmergencyEvent(params.eventId);
        if (cancelled) return;
        setEvent(event);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "이벤트를 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [params.eventId]);

  async function handleAcknowledge() {
    setAcking(true);
    try {
      await fetch(`/api/emergency/${params.eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "acknowledged" }),
      });
      setEvent(await fetchEmergencyEvent(params.eventId));
    } finally {
      setAcking(false);
    }
  }

  if (loading) return <p className="text-muted-foreground">불러오는 중...</p>;
  if (error || !event) return <p className="text-danger-foreground">{error ?? "이벤트를 찾을 수 없습니다."}</p>;

  const isOpen = event.status === "open";

  return (
    <div className="flex flex-col gap-6">
      <Link href="/guardian" className="text-sm text-muted-foreground underline underline-offset-2">
        ← 대시보드로
      </Link>

      <div className={`rounded-2xl border-2 p-6 ${isOpen ? "border-rose-500 bg-danger-bg" : "border-emerald-500/60 bg-emerald-500/10"}`}>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {isOpen ? "미확인 긴급 상황" : "확인됨"}
        </p>
        <h2 className="mt-1 text-2xl font-bold">{event.patient.name}님</h2>
        <p className="mt-2 text-lg">{TRIGGER_LABELS[event.triggerType] ?? "확인이 필요합니다"}</p>
        {event.detail && <p className="mt-2 text-muted-foreground">{event.detail}</p>}
        <p className="mt-4 text-sm text-muted-foreground">
          발생 시각: {new Date(event.createdAt).toLocaleString("ko-KR")}
        </p>
        {event.acknowledgedByName && (
          <p className="mt-1 text-sm text-emerald-300">
            {event.acknowledgedByName}님이 확인했습니다
            {event.acknowledgedAt && ` (${new Date(event.acknowledgedAt).toLocaleString("ko-KR")})`}
          </p>
        )}
      </div>

      {isOpen && (
        <button
          type="button"
          onClick={handleAcknowledge}
          disabled={acking}
          className="rounded-full bg-accent px-6 py-4 text-lg font-medium text-accent-foreground hover:brightness-110 disabled:opacity-50"
        >
          {acking ? "처리 중..." : "확인했습니다"}
        </button>
      )}
    </div>
  );
}
