"use client";

import { useEffect, useState } from "react";
import type { Medication } from "@prisma/client";
import { MedicationForm } from "@/components/guardian/MedicationForm";
import { PatientSelector } from "@/components/guardian/PatientSelector";
import { useLinkedPatients } from "@/hooks/useLinkedPatients";

function formatDate(value: string | Date) {
  return new Date(value).toLocaleDateString("ko-KR");
}

// 컴포넌트 밖에 두어야 렌더 중 Date.now() 호출로 취급되지 않는다(react-hooks/purity).
function isEndingSoon(endDate: Date | string | null) {
  if (!endDate) return false;
  const days = (new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  return days >= 0 && days <= 3;
}
function isEnded(endDate: Date | string | null) {
  return Boolean(endDate) && new Date(endDate!).getTime() < Date.now();
}

export default function MedicationsPage() {
  const { patients, selectedId, setSelectedId, loading: loadingPatients } = useLinkedPatients();
  const [medications, setMedications] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Medication | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;

    async function loadMedications() {
      setLoading(true);
      try {
        const response = await fetch(`/api/guardian/medications?patientId=${selectedId}`);
        const data = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          setError(data.error ?? "약 목록을 불러오지 못했습니다.");
          return;
        }
        setMedications(data.medications ?? []);
        setError(null);
      } catch {
        if (!cancelled) setError("약 목록을 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadMedications();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  async function handleDelete(id: string) {
    if (!confirm("이 약 정보를 삭제할까요?")) return;
    const response = await fetch(`/api/guardian/medications/${id}`, { method: "DELETE" });
    if (response.ok) setMedications((prev) => prev.filter((m) => m.id !== id));
  }

  function handleSaved(medication: Medication) {
    setMedications((prev) => {
      const exists = prev.some((m) => m.id === medication.id);
      return exists ? prev.map((m) => (m.id === medication.id ? medication : m)) : [medication, ...prev];
    });
    setShowForm(false);
    setEditing(null);
  }

  if (loadingPatients) return <p className="text-muted-foreground">불러오는 중...</p>;
  if (patients.length === 0) {
    return <p className="text-muted-foreground">연동된 환자가 없습니다. 먼저 환자를 연동해주세요.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <PatientSelector patients={patients} selectedId={selectedId} onSelect={setSelectedId} />

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">복용약</h2>
        {!showForm && selectedId && (
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
            className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:brightness-110"
          >
            + 약 추가
          </button>
        )}
      </div>

      {showForm && selectedId && (
        <MedicationForm
          patientId={selectedId}
          initial={editing ?? undefined}
          onSaved={handleSaved}
          onCancel={() => {
            setShowForm(false);
            setEditing(null);
          }}
        />
      )}

      {error && <p className="text-danger-foreground">{error}</p>}
      {loading ? (
        <p className="text-muted-foreground">불러오는 중...</p>
      ) : medications.length === 0 ? (
        <p className="text-muted-foreground">등록된 약이 없습니다.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {medications.map((medication) => (
            <div
              key={medication.id}
              className={`flex items-center justify-between rounded-2xl border p-4 ${
                isEnded(medication.endDate)
                  ? "border-surface-border bg-surface opacity-60"
                  : isEndingSoon(medication.endDate)
                    ? "border-amber-400/60 bg-amber-500/10"
                    : "border-surface-border bg-surface"
              }`}
            >
              <div>
                <p className="font-semibold">
                  {medication.name} · {medication.dosage}
                </p>
                <p className="text-sm text-muted-foreground">{medication.frequency}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(medication.startDate)} ~ {medication.endDate ? formatDate(medication.endDate) : "계속"}
                  {isEndingSoon(medication.endDate) && !isEnded(medication.endDate) && (
                    <span className="ml-2 font-medium text-amber-300">곧 종료</span>
                  )}
                  {isEnded(medication.endDate) && <span className="ml-2 font-medium">종료됨</span>}
                </p>
                {medication.notes && <p className="mt-1 text-sm text-muted-foreground">{medication.notes}</p>}
              </div>
              <div className="flex shrink-0 gap-2 text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setEditing(medication);
                    setShowForm(true);
                  }}
                  className="text-accent underline underline-offset-2"
                >
                  수정
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(medication.id)}
                  className="text-danger-foreground underline underline-offset-2"
                >
                  삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
