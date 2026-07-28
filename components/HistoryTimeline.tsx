import { MOOD_LABELS, isMood } from "@/lib/db/types";

export interface HistorySessionSummary {
  id: string;
  startedAt: string;
  endedAt: string | null;
  turnCount: number;
  mood: { mood: string; confidence: number; summary: string } | null;
}

interface HistoryTimelineProps {
  sessions: HistorySessionSummary[];
  selectedId: string | null;
  onSelect: (sessionId: string) => void;
  /** 보호자 화면은 정보 밀도를 높이고, 환자 화면은 큰 글씨로 단순하게 보여준다. */
  dense?: boolean;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" });
}

export function HistoryTimeline({
  sessions,
  selectedId,
  onSelect,
  dense = false,
}: HistoryTimelineProps) {
  if (sessions.length === 0) {
    return <p className="text-muted-foreground">아직 저장된 대화가 없습니다.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {sessions.map((session) => {
        const mood = session.mood && isMood(session.mood.mood) ? session.mood.mood : null;
        const isSelected = session.id === selectedId;

        return (
          <li key={session.id}>
            <button
              type="button"
              onClick={() => onSelect(session.id)}
              className={`w-full rounded-2xl border p-4 text-left transition ${
                isSelected
                  ? "border-accent bg-accent/10"
                  : "border-surface-border bg-surface hover:border-accent/50"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className={dense ? "font-medium" : "text-lg font-semibold"}>
                  {formatDate(session.startedAt)}
                </span>
                {mood && (
                  <span className={`text-sm ${MOOD_LABELS[mood].className}`}>
                    {MOOD_LABELS[mood].emoji} {MOOD_LABELS[mood].label}
                  </span>
                )}
              </div>

              <p className="mt-1 text-sm text-muted-foreground">
                {formatTime(session.startedAt)} · 대화 {session.turnCount}번
              </p>

              {dense && session.mood?.summary && (
                <p className="mt-2 text-sm text-muted-foreground">{session.mood.summary}</p>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
