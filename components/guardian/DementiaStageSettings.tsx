"use client";

import { useState } from "react";
import type { LinkedPatient } from "@/hooks/useLinkedPatients";
import { DEMENTIA_STAGE_LABELS, DEMENTIA_STAGE_VALUES, type DementiaStage } from "@/lib/db/types";

const DEFAULT_STAGE: DementiaStage = "moderate";

interface DementiaStageSettingsProps {
  patients: LinkedPatient[];
}

/** 알츠하이머 진행 단계(경도/중등도/중증) - 대화 페르소나가 이 값에 맞춰 문장 길이/질문
 * 방식을 조절한다(app/api/chat/route.ts). 설정 없으면 중등도 기준으로 동작한다. */
export function DementiaStageSettings({ patients }: DementiaStageSettingsProps) {
  const [drafts, setDrafts] = useState<Record<string, DementiaStage>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function draftFor(patient: LinkedPatient): DementiaStage {
    return drafts[patient.id] ?? (patient.dementiaStage as DementiaStage | null) ?? DEFAULT_STAGE;
  }

  async function handleSave(patient: LinkedPatient, stage: DementiaStage) {
    setDrafts((prev) => ({ ...prev, [patient.id]: stage }));
    setSavingId(patient.id);
    setError(null);
    try {
      const response = await fetch(`/api/guardian/patients/${patient.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dementiaStage: stage === DEFAULT_STAGE ? null : stage }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "저장에 실패했습니다.");
        return;
      }
      setDrafts((prev) => ({ ...prev, [patient.id]: (data.patient.dementiaStage as DementiaStage | null) ?? DEFAULT_STAGE }));
    } catch {
      setError("저장에 실패했습니다.");
    } finally {
      setSavingId(null);
    }
  }

  if (patients.length === 0) {
    return (
      <section className="flex flex-col gap-2 rounded-lg border border-surface-border bg-surface p-5">
        <h2 className="text-lg font-semibold">진행 단계</h2>
        <p className="text-sm text-muted-foreground">
          환자를 먼저 연동하면 여기서 알츠하이머 진행 단계를 설정할 수 있어요.
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-surface-border bg-surface p-5">
      <h2 className="text-lg font-semibold">진행 단계</h2>
      <p className="text-sm text-muted-foreground">
        대화 AI가 이 단계에 맞춰 문장 길이와 질문 방식을 조절해요. 잘 모르시면 &ldquo;중등도&rdquo;를 두시면 됩니다.
      </p>
      {patients.map((patient) => (
        <div key={patient.id} className="flex items-center gap-2">
          {patients.length > 1 && <span className="w-20 shrink-0 text-sm text-muted-foreground">{patient.name}</span>}
          <select
            value={draftFor(patient)}
            onChange={(e) => handleSave(patient, e.target.value as DementiaStage)}
            disabled={savingId === patient.id}
            className="flex-1 rounded-xl border border-surface-border bg-background px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-50"
          >
            {DEMENTIA_STAGE_VALUES.map((stage) => (
              <option key={stage} value={stage}>
                {DEMENTIA_STAGE_LABELS[stage]}
              </option>
            ))}
          </select>
          {savingId === patient.id && <span className="text-xs text-muted-foreground">저장 중...</span>}
        </div>
      ))}
      {error && <p className="text-sm text-danger-foreground">{error}</p>}
    </section>
  );
}
