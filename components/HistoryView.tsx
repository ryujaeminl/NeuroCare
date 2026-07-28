"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { HistoryTimeline, type HistorySessionSummary } from "@/components/HistoryTimeline";
import { MoodChart, type MoodPoint } from "@/components/MoodChart";
import { MOOD_LABELS, isMood } from "@/lib/db/types";

interface SessionDetail {
  id: string;
  startedAt: string;
  turns: Array<{ id: string; role: string; text: string; createdAt: string }>;
  mood: {
    mood: string;
    confidence: number;
    summary: string;
    notableMoments: string[];
  } | null;
}

interface SearchHit {
  id: string;
  role: string;
  text: string;
  createdAt: string;
  sessionId: string;
}

interface HistoryViewProps {
  /** 보호자가 특정 환자를 볼 때 지정. 환자 본인이면 생략한다. */
  patientId?: string;
  /** 보호자 화면은 정보 밀도를 높인다. */
  dense?: boolean;
}

export function HistoryView({ patientId, dense = false }: HistoryViewProps) {
  const [sessions, setSessions] = useState<HistorySessionSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [query, setQuery] = useState("");
  const [searchHits, setSearchHits] = useState<SearchHit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const baseParams = useMemo(() => (patientId ? `patientId=${patientId}` : ""), [patientId]);

  useEffect(() => {
    let cancelled = false;

    async function loadSessions() {
      setLoading(true);
      try {
        const response = await fetch(`/api/history?${baseParams}`);
        const data = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          setError(data.error ?? "기록을 불러오지 못했습니다.");
          return;
        }
        setSessions(data.sessions ?? []);
        setError(null);
      } catch {
        if (!cancelled) setError("기록을 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadSessions();

    return () => {
      cancelled = true;
    };
  }, [baseParams]);

  const openSession = useCallback(
    async (sessionId: string) => {
      setSelectedId(sessionId);
      setDetail(null);
      try {
        const response = await fetch(`/api/history?${baseParams}&sessionId=${sessionId}`);
        const data = await response.json();
        if (response.ok) setDetail(data.session);
      } catch {
        setError("대화 내용을 불러오지 못했습니다.");
      }
    },
    [baseParams],
  );

  const runSearch = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!query.trim()) {
        setSearchHits(null);
        return;
      }
      try {
        const response = await fetch(
          `/api/history?${baseParams}&q=${encodeURIComponent(query.trim())}`,
        );
        const data = await response.json();
        if (response.ok) setSearchHits(data.results ?? []);
      } catch {
        setError("검색에 실패했습니다.");
      }
    },
    [baseParams, query],
  );

  const moodPoints: MoodPoint[] = useMemo(
    () =>
      [...sessions]
        .reverse()
        .filter((s) => s.mood && isMood(s.mood.mood))
        .map((s) => ({
          date: s.startedAt.slice(0, 10),
          mood: s.mood!.mood as MoodPoint["mood"],
        })),
    [sessions],
  );

  if (loading) {
    return <p className="text-muted-foreground">불러오는 중...</p>;
  }
  if (error) {
    return <p className="text-danger-foreground">{error}</p>;
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-2xl border border-surface-border bg-surface p-5">
        <h2 className="font-semibold">기분 추이</h2>
        <p className="mt-1 mb-4 text-xs text-muted-foreground">
          의학적 진단이 아니라 대화에서 드러난 정서적 톤을 참고용으로 정리한 것입니다. 걱정되는
          변화가 반복된다면 전문가 상담을 권합니다.
        </p>
        <MoodChart points={moodPoints} />
      </section>

      <form onSubmit={runSearch} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="예전 대화에서 찾기 (예: 손주, 된장찌개)"
          className="flex-1 rounded-xl border border-surface-border bg-surface px-4 py-3 outline-none focus:border-accent"
        />
        <button
          type="submit"
          className="rounded-xl bg-accent px-5 py-3 font-medium text-accent-foreground hover:brightness-110"
        >
          검색
        </button>
      </form>

      {searchHits && (
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">검색 결과 {searchHits.length}건</h2>
            <button
              type="button"
              onClick={() => setSearchHits(null)}
              className="text-sm text-muted-foreground underline"
            >
              닫기
            </button>
          </div>
          {searchHits.map((hit) => (
            <button
              key={hit.id}
              type="button"
              onClick={() => openSession(hit.sessionId)}
              className="rounded-xl border border-surface-border bg-background p-4 text-left hover:border-accent/50"
            >
              <p className="text-xs text-muted-foreground">
                {hit.role === "assistant" ? "AI" : "환자"} ·{" "}
                {new Date(hit.createdAt).toLocaleDateString("ko-KR")}
              </p>
              <p className="mt-1">{hit.text}</p>
            </button>
          ))}
          {searchHits.length === 0 && (
            <p className="text-muted-foreground">일치하는 대화를 찾지 못했습니다.</p>
          )}
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 font-semibold">날짜별 대화</h2>
          <HistoryTimeline
            sessions={sessions}
            selectedId={selectedId}
            onSelect={openSession}
            dense={dense}
          />
        </section>

        <section>
          <h2 className="mb-3 font-semibold">대화 내용</h2>
          {!selectedId && <p className="text-muted-foreground">왼쪽에서 날짜를 선택하세요.</p>}
          {selectedId && !detail && <p className="text-muted-foreground">불러오는 중...</p>}

          {detail && (
            <div className="flex flex-col gap-4">
              {detail.mood && isMood(detail.mood.mood) && (
                <div className="rounded-2xl border border-surface-border bg-surface p-4">
                  <p className={`font-semibold ${MOOD_LABELS[detail.mood.mood].className}`}>
                    {MOOD_LABELS[detail.mood.mood].emoji} {MOOD_LABELS[detail.mood.mood].label}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      확신도 {Math.round(detail.mood.confidence * 100)}%
                    </span>
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">{detail.mood.summary}</p>
                  {detail.mood.notableMoments.length > 0 && (
                    <ul className="mt-3 flex flex-col gap-1 border-t border-surface-border pt-3">
                      {detail.mood.notableMoments.map((moment, index) => (
                        <li key={index} className="text-sm text-muted-foreground">
                          &ldquo;{moment}&rdquo;
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-3">
                {detail.turns.map((turn) => (
                  <div
                    key={turn.id}
                    className={`rounded-xl border p-4 ${
                      turn.role === "assistant"
                        ? "border-accent/30 bg-accent/10"
                        : "border-surface-border bg-background"
                    }`}
                  >
                    <p className="text-xs font-medium text-muted-foreground">
                      {turn.role === "assistant" ? "AI" : "환자"}
                    </p>
                    <p className={dense ? "mt-1" : "mt-1 text-lg"}>{turn.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
