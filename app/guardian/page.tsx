"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { HistoryView } from "@/components/HistoryView";
import { FamilySummaryCard } from "@/components/guardian/FamilySummaryCard";
import { MedicationSummaryCard } from "@/components/guardian/MedicationSummaryCard";
import { MoodSummaryCard } from "@/components/guardian/MoodSummaryCard";
import { PatientSelector } from "@/components/guardian/PatientSelector";
import { SELECTED_PATIENT_STORAGE_KEY, useLinkedPatients } from "@/hooks/useLinkedPatients";
import { DEFAULT_WIDGET_ORDER, type WidgetId } from "@/lib/db/types";

// 로그인/보호자 role 검증은 app/guardian/layout.tsx에서 이미 끝났다.
export default function GuardianPage() {
  const { patients, selectedId, setSelectedId, loading, error } = useLinkedPatients();
  const [widgetOrder, setWidgetOrder] = useState<WidgetId[]>([...DEFAULT_WIDGET_ORDER]);

  // 첫 로그인(세션스토리지에 선택 이력이 없을 때)에만 GuardianPreference.defaultPatientId를 적용한다.
  useEffect(() => {
    if (patients.length === 0) return;
    fetch("/api/guardian/preferences")
      .then((r) => r.json())
      .then((data) => {
        if (data.preference?.dashboardOrder) setWidgetOrder(data.preference.dashboardOrder);
        const hadStoredSelection = window.sessionStorage.getItem(SELECTED_PATIENT_STORAGE_KEY);
        const defaultPatientId = data.preference?.defaultPatientId;
        if (!hadStoredSelection && defaultPatientId && patients.some((p) => p.id === defaultPatientId)) {
          setSelectedId(defaultPatientId);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patients.length]);

  if (loading) {
    return <p className="text-muted-foreground">불러오는 중...</p>;
  }

  if (patients.length === 0) {
    return (
      <div className="rounded-lg border border-surface-border bg-surface p-6 text-center">
        <p className="font-medium">아직 연동된 환자가 없습니다.</p>
        <p className="mt-2 text-sm text-muted-foreground">환자분께 초대 코드를 받아 연동해주세요.</p>
        <Link
          href="/guardian/link"
          className="mt-4 inline-block rounded-lg bg-accent px-6 py-3 font-medium text-accent-foreground transition hover:-translate-y-0.5 hover:shadow-md hover:brightness-110"
        >
          초대 코드 입력하기
        </Link>
      </div>
    );
  }

  const selectedPatient = patients.find((p) => p.id === selectedId);

  return (
    <div className="flex flex-col gap-6">
      {error && <p className="text-danger-foreground">{error}</p>}
      <PatientSelector patients={patients} selectedId={selectedId} onSelect={setSelectedId} />

      {selectedId && selectedPatient && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 [&>*:nth-child(1)]:[animation-delay:0ms] [&>*:nth-child(2)]:[animation-delay:70ms] [&>*:nth-child(3)]:[animation-delay:140ms]">
            {widgetOrder.map((widget) => {
              if (widget === "mood") {
                return <MoodSummaryCard key={widget} patientId={selectedId} lastSession={selectedPatient.lastSession} />;
              }
              if (widget === "medication") {
                return <MedicationSummaryCard key={widget} patientId={selectedId} />;
              }
              return <FamilySummaryCard key={widget} patientId={selectedId} />;
            })}
          </div>

          <HistoryView patientId={selectedId} dense />
        </>
      )}
    </div>
  );
}
