"use client";

import { useState } from "react";
import type { Medication } from "@prisma/client";

interface MedicationFormProps {
  patientId: string;
  initial?: Medication;
  onSaved: (medication: Medication) => void;
  onCancel: () => void;
}

function toDateInput(value: Date | string | null | undefined) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

/** 복용약 추가/수정 폼. initial이 있으면 수정 모드로 PATCH, 없으면 POST한다. */
export function MedicationForm({ patientId, initial, onSaved, onCancel }: MedicationFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [dosage, setDosage] = useState(initial?.dosage ?? "");
  const [frequency, setFrequency] = useState(initial?.frequency ?? "");
  const [startDate, setStartDate] = useState(toDateInput(initial?.startDate) || toDateInput(new Date()));
  const [endDate, setEndDate] = useState(toDateInput(initial?.endDate));
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const url = initial ? `/api/guardian/medications/${initial.id}` : "/api/guardian/medications";
      const response = await fetch(url, {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          name,
          dosage,
          frequency,
          startDate,
          endDate: endDate || null,
          notes: notes || null,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "저장에 실패했습니다.");
        return;
      }
      onSaved(data.medication);
    } catch {
      setError("저장에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-2xl border border-surface-border bg-surface p-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          약 이름
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="혈압약"
            required
            className="rounded-xl border border-surface-border bg-background px-3 py-2 outline-none focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          용량
          <input
            value={dosage}
            onChange={(e) => setDosage(e.target.value)}
            placeholder="1정"
            required
            className="rounded-xl border border-surface-border bg-background px-3 py-2 outline-none focus:border-accent"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        복용 주기
        <input
          value={frequency}
          onChange={(e) => setFrequency(e.target.value)}
          placeholder="아침/저녁 식후"
          required
          className="rounded-xl border border-surface-border bg-background px-3 py-2 outline-none focus:border-accent"
        />
      </label>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          시작일
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
            className="rounded-xl border border-surface-border bg-background px-3 py-2 outline-none focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          종료일 (선택)
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-xl border border-surface-border bg-background px-3 py-2 outline-none focus:border-accent"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        메모 (선택)
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="rounded-xl border border-surface-border bg-background px-3 py-2 outline-none focus:border-accent"
        />
      </label>

      {error && <p className="text-sm text-danger-foreground">{error}</p>}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-surface-border px-5 py-2 text-sm hover:border-accent/50"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-foreground hover:brightness-110 disabled:opacity-50"
        >
          {submitting ? "저장 중..." : "저장"}
        </button>
      </div>
    </form>
  );
}
