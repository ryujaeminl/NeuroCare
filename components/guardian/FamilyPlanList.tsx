"use client";

import { useEffect, useState } from "react";
import type { FamilyPlan } from "@prisma/client";

function toDateInput(value: Date | string) {
  return new Date(value).toISOString().slice(0, 10);
}

/** 방문/생일 등 다가오는 가족 일정. 2주 이내로 다가오면 AI가 대화 중 자연스럽게 언급한다
 * (app/api/chat/route.ts) - 여기서는 등록/목록/삭제만 다룬다. */
export function FamilyPlanList({ patientId }: { patientId: string }) {
  const [plans, setPlans] = useState<FamilyPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const response = await fetch(`/api/guardian/plans?patientId=${patientId}`);
        const data = await response.json();
        if (!cancelled) setPlans(data.plans ?? []);
      } catch {
        if (!cancelled) setError("일정을 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/guardian/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, title, date, notes: notes || null }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "등록에 실패했습니다.");
        return;
      }
      setPlans((prev) => [...prev, data.plan].sort((a, b) => a.date.localeCompare(b.date)));
      setTitle("");
      setDate("");
      setNotes("");
    } catch {
      setError("등록에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    setPlans((prev) => prev.filter((p) => p.id !== id));
    await fetch(`/api/guardian/plans/${id}`, { method: "DELETE" }).catch(() => {});
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-surface-border bg-surface p-5">
      <h3 className="font-semibold">가족 일정</h3>
      <p className="text-sm text-muted-foreground">
        방문 예정일, 생일처럼 다가오는 일정을 등록하면 2주 이내로 가까워졌을 때 AI가 대화 중
        자연스럽게 언급합니다.
      </p>

      <form onSubmit={handleAdd} className="flex flex-col gap-2 sm:flex-row">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="일정 (예: 손녀 방문)"
          required
          className="flex-1 rounded-xl border border-surface-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
          className="rounded-xl border border-surface-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="메모 (선택)"
          className="rounded-xl border border-surface-border bg-background px-3 py-2 text-sm outline-none focus:border-accent sm:w-40"
        />
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:brightness-110 disabled:opacity-50"
        >
          등록
        </button>
      </form>

      {error && <p className="text-sm text-danger-foreground">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted-foreground">불러오는 중...</p>
      ) : plans.length === 0 ? (
        <p className="text-sm text-muted-foreground">등록된 일정이 없습니다.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {plans.map((plan) => (
            <li
              key={plan.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-surface-border bg-background px-3 py-2 text-sm"
            >
              <div>
                <p>
                  <span className="font-medium">{toDateInput(plan.date)}</span> {plan.title}
                  {plan.notes && <span className="text-muted-foreground"> ({plan.notes})</span>}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(plan.id)}
                className="shrink-0 text-xs text-muted-foreground hover:text-danger-foreground"
              >
                삭제
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
