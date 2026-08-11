"use client";

import { useState } from "react";
import type { LinkedPatient } from "@/hooks/useLinkedPatients";

export const DEFAULT_WAKE_WORD = "복실아";

interface WakeWordSettingsProps {
  patients: LinkedPatient[];
}

/** 환자가 앱을 깨울 때 부르는 호출어. 비워두면 기본값("복실아")으로 돌아간다 - 환자마다
 * 다르게 설정할 수 있어(태블릿 1대 = 환자 1명) patientId별로 따로 저장한다. */
export function WakeWordSettings({ patients }: WakeWordSettingsProps) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function draftFor(patient: LinkedPatient): string {
    return drafts[patient.id] ?? patient.wakeWord ?? DEFAULT_WAKE_WORD;
  }

  async function handleSave(patient: LinkedPatient) {
    const wakeWord = draftFor(patient).trim();
    setSavingId(patient.id);
    setError(null);
    try {
      const response = await fetch(`/api/guardian/patients/${patient.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wakeWord: wakeWord === DEFAULT_WAKE_WORD ? null : wakeWord }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "저장에 실패했습니다.");
        return;
      }
      // 서버가 정규화한 값(빈 값 -> null -> 기본값 표시)으로 로컬 초안을 맞춘다.
      setDrafts((prev) => ({ ...prev, [patient.id]: data.patient.wakeWord ?? DEFAULT_WAKE_WORD }));
    } catch {
      setError("저장에 실패했습니다.");
    } finally {
      setSavingId(null);
    }
  }

  if (patients.length === 0) {
    return (
      <section className="flex flex-col gap-2 rounded-lg border border-surface-border bg-surface p-5">
        <h2 className="text-lg font-semibold">호출어</h2>
        <p className="text-sm text-muted-foreground">
          환자를 먼저 연동하면 여기서 호출어(기본값 &ldquo;{DEFAULT_WAKE_WORD}&rdquo;)를 바꿀 수 있어요.
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-surface-border bg-surface p-5">
      <h2 className="text-lg font-semibold">호출어</h2>
      <p className="text-sm text-muted-foreground">
        환자가 이 이름을 부르면 앱이 켜집니다. 기본값은 &ldquo;{DEFAULT_WAKE_WORD}&rdquo;예요.
      </p>
      {patients.map((patient) => (
        <div key={patient.id} className="flex items-center gap-2">
          {patients.length > 1 && <span className="w-20 shrink-0 text-sm text-muted-foreground">{patient.name}</span>}
          <input
            value={draftFor(patient)}
            onChange={(e) => setDrafts((prev) => ({ ...prev, [patient.id]: e.target.value }))}
            placeholder={DEFAULT_WAKE_WORD}
            className="flex-1 rounded-xl border border-surface-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={() => handleSave(patient)}
            disabled={savingId === patient.id}
            className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:brightness-110 disabled:opacity-50"
          >
            {savingId === patient.id ? "저장 중..." : "저장"}
          </button>
        </div>
      ))}
      {error && <p className="text-sm text-danger-foreground">{error}</p>}
    </section>
  );
}
