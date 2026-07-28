"use client";

import { useEffect, useState } from "react";
import { MOOD_CONCERN_LEVEL, MOOD_LABELS, isMood, type Mood } from "@/lib/db/types";

interface SessionMood {
  startedAt: string;
  mood: { mood: string; summary: string } | null;
}

interface MoodSummaryCardProps {
  patientId: string;
  lastSession: SessionMood | null;
}

const CONCERNING_STREAK = 3;

/** 최근 N건 연속으로 우려되는 기분(혼란/불안/가라앉음)이면 배너를 띄운다. */
function hasConcerningStreak(sessions: SessionMood[]): boolean {
  const recentMoods = sessions
    .slice(0, CONCERNING_STREAK)
    .map((s) => s.mood?.mood)
    .filter((m): m is string => Boolean(m) && isMood(m!));
  if (recentMoods.length < CONCERNING_STREAK) return false;
  return recentMoods.every((mood) => MOOD_CONCERN_LEVEL[mood as Mood] >= 2);
}

export function MoodSummaryCard({ patientId, lastSession }: MoodSummaryCardProps) {
  const [concerning, setConcerning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function checkTrend() {
      try {
        const response = await fetch(`/api/history?patientId=${patientId}`);
        const data = await response.json();
        if (!cancelled && response.ok) setConcerning(hasConcerningStreak(data.sessions ?? []));
      } catch {
        // 배너는 참고용이라 실패해도 조용히 넘어간다.
      }
    }
    void checkTrend();
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  const mood = lastSession?.mood;
  const moodKey = mood && isMood(mood.mood) ? mood.mood : null;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-surface-border bg-surface p-5">
      <h3 className="font-semibold">오늘의 기분</h3>

      {concerning && (
        <p className="rounded-xl border border-amber-400/60 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          최근 대화에서 우려되는 정서 신호가 반복되고 있습니다. 전문가 상담을 권장합니다.
        </p>
      )}

      {moodKey ? (
        <div>
          <p className={`text-lg font-semibold ${MOOD_LABELS[moodKey].className}`}>
            {MOOD_LABELS[moodKey].emoji} {MOOD_LABELS[moodKey].label}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{mood!.summary}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {new Date(lastSession!.startedAt).toLocaleDateString("ko-KR")} 대화 기준
          </p>
        </div>
      ) : (
        <p className="text-muted-foreground">아직 분석된 기분 기록이 없습니다.</p>
      )}
    </div>
  );
}
