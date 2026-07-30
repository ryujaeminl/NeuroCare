"use client";

import { useState } from "react";
import type { Medication } from "@prisma/client";
import { parseReminderTimes } from "@/lib/db/types";

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
  const [reminderTimes, setReminderTimes] = useState<string[]>(
    initial ? parseReminderTimes(initial.reminderTimes) : [],
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function updateReminderTime(index: number, value: string) {
    setReminderTimes((prev) => prev.map((t, i) => (i === index ? value : t)));
  }
  function removeReminderTime(index: number) {
    setReminderTimes((prev) => prev.filter((_, i) => i !== index));
  }
  function addReminderTime() {
    setReminderTimes((prev) => [...prev, "08:00"]);
  }

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
          reminderTimes,
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

      <div className="flex flex-col gap-2 text-sm">
        <span>
          알림 시각 (선택){" "}
          <span className="text-muted-foreground">- 설정에서 복약 알림을 켠 보호자에게 이 시각마다 발송</span>
        </span>
        {reminderTimes.map((time, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              type="time"
              value={time}
              onChange={(e) => updateReminderTime(index, e.target.value)}
              className="rounded-xl border border-surface-border bg-background px-3 py-2 outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={() => removeReminderTime(index)}
              className="rounded-full border border-surface-border px-3 py-1 text-xs hover:border-accent/50"
            >
              삭제
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addReminderTime}
          className="self-start rounded-full border border-dashed border-surface-border px-4 py-1.5 text-xs hover:border-accent/50"
        >
          + 알림 시각 추가
        </button>
      </div>

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
