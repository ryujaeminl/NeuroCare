import { MOOD_LABELS, isMood } from "@/lib/db/types";
import type { LinkedPatient } from "@/hooks/useLinkedPatients";

interface PatientSelectorProps {
  patients: LinkedPatient[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function PatientSelector({ patients, selectedId, onSelect }: PatientSelectorProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {patients.map((patient) => {
        const mood = patient.lastSession?.mood;
        const moodKey = mood && isMood(mood.mood) ? mood.mood : null;
        return (
          <button
            key={patient.id}
            type="button"
            onClick={() => onSelect(patient.id)}
            className={`rounded-2xl border px-5 py-3 text-left transition ${
              selectedId === patient.id
                ? "border-accent bg-accent/10"
                : "border-surface-border bg-surface hover:border-accent/50"
            }`}
          >
            <span className="font-semibold">{patient.name}</span>
            {moodKey && (
              <span className={`ml-2 text-sm ${MOOD_LABELS[moodKey].className}`}>
                {MOOD_LABELS[moodKey].emoji} {MOOD_LABELS[moodKey].label}
              </span>
            )}
            <span className="block text-xs text-muted-foreground">
              {patient.lastSession
                ? `최근 대화 ${new Date(patient.lastSession.startedAt).toLocaleDateString("ko-KR")}`
                : "대화 기록 없음"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
