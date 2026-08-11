"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Medication } from "@prisma/client";

function isEndingSoon(endDate: Date | string | null) {
  if (!endDate) return false;
  const days = (new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  return days >= 0 && days <= 3;
}
function isActive(endDate: Date | string | null) {
  return !endDate || new Date(endDate).getTime() >= Date.now();
}

export function MedicationSummaryCard({ patientId }: { patientId: string }) {
  const [medications, setMedications] = useState<Medication[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/guardian/medications?patientId=${patientId}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setMedications(data.medications ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  const active = medications.filter((m) => isActive(m.endDate));
  const endingSoon = active.filter((m) => isEndingSoon(m.endDate));

  return (
    <Link
      href="/guardian/medications"
      className="animate-card-rise flex flex-col gap-3 rounded-lg border border-surface-border bg-surface p-5 transition hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-md"
    >
      <h3 className="font-semibold">복용약 현황</h3>
      {active.length === 0 ? (
        <p className="text-muted-foreground">등록된 약이 없습니다.</p>
      ) : (
        <div>
          <p className="text-lg font-semibold">{active.length}개 복용 중</p>
          {endingSoon.length > 0 && (
            <p className="mt-1 text-sm text-amber-700">{endingSoon.map((m) => m.name).join(", ")} 곧 종료</p>
          )}
        </div>
      )}
    </Link>
  );
}
