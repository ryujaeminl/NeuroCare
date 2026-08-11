"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MOOD_LABELS, isMood, type Mood } from "@/lib/db/types";

interface TodayMood {
  mood: Mood;
  summary: string;
}

interface TodayMoodCardProps {
  /** 값이 바뀌면 다시 조회한다. 대화가 한 턴 오갈 때마다 갱신하려고 쓴다. */
  refreshKey: number;
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

/**
 * 오늘 대화에서 분석된 기분을 보여준다.
 * 환자가 직접 고르는 게 아니라 대화 내용을 분석한 결과라, 이모지 버튼 대신 결과를 표시한다.
 * 분석은 세션이 끝날 때 /api/mood에서 이뤄지고 여기서는 저장된 결과만 읽는다.
 */
export function TodayMoodCard({ refreshKey }: TodayMoodCardProps) {
  const [today, setToday] = useState<TodayMood | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadTodayMood() {
      try {
        const response = await fetch("/api/history");
        if (!response.ok) return;
        const data = (await response.json()) as {
          sessions?: Array<{ startedAt: string; mood: { mood: string; summary: string } | null }>;
        };
        if (cancelled) return;

        const latest = (data.sessions ?? [])
          .filter((s) => s.mood && isToday(s.startedAt))
          .find((s) => s.mood && isMood(s.mood.mood));

        setToday(
          latest?.mood && isMood(latest.mood.mood)
            ? { mood: latest.mood.mood, summary: latest.mood.summary }
            : null,
        );
      } catch {
        // 기분 표시는 부가 정보라 실패해도 조용히 넘어간다.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }

    void loadTodayMood();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const label = today ? MOOD_LABELS[today.mood] : null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-surface-border bg-surface p-5 text-left">
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-500/20 text-lg">
        {label?.emoji ?? "🙂"}
      </span>

      <div>
        <p className="font-semibold">오늘의 기분</p>
        {!loaded && <p className="mt-1 text-sm text-muted-foreground">확인 중...</p>}

        {loaded && !today && (
          <p className="mt-1 text-sm text-muted-foreground">
            대화를 나누면 오늘의 기분을 자동으로 정리해 드려요.
          </p>
        )}

        {loaded && today && label && (
          <>
            <p className={`mt-1 font-semibold ${label.className}`}>{label.label}</p>
            <p className="mt-1 text-sm text-muted-foreground">{today.summary}</p>
          </>
        )}
      </div>

      {today && (
        <Link href="/history" className="text-sm font-medium text-accent">
          자세히 보기 →
        </Link>
      )}
    </div>
  );
}
