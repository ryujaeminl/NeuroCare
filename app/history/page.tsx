'use client';

import { useState } from 'react';
import AppHeader from '@/components/layout/AppHeader';
import ProtectedShell from '@/components/layout/ProtectedShell';
import { getHistory, clearHistory, groupHistoryByDate, type HistoryEntry } from '@/lib/history';
import { TrashIcon, RobotIcon } from '@/components/icons';

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

export default function HistoryPage() {
  const [entries, setEntries] = useState<HistoryEntry[]>(getHistory);

  const handleClear = () => {
    clearHistory();
    setEntries([]);
  };

  const groups = groupHistoryByDate(entries).reverse();

  return (
    <ProtectedShell>
      <div className="min-h-screen flex flex-col pb-24">
        <AppHeader />

        <main className="flex-1 px-5 pt-2 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-navy">대화 기록</h1>
              <p className="text-sm text-ink-muted mt-1">지금까지 나눈 대화를 날짜별로 볼 수 있어요.</p>
            </div>
            {entries.length > 0 && (
              <button
                onClick={handleClear}
                className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-white shadow-card text-sm text-ink-muted"
              >
                <TrashIcon className="w-4 h-4" />
                전체 삭제
              </button>
            )}
          </div>

          {entries.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-card p-8 flex flex-col items-center text-center gap-3">
              <span className="w-14 h-14 rounded-full bg-mint-soft flex items-center justify-center">
                <RobotIcon className="w-7 h-7 text-mint" />
              </span>
              <p className="font-bold text-navy">아직 대화 기록이 없어요</p>
              <p className="text-sm text-ink-muted">Assistant 화면에서 대화를 나누면 여기에 저장돼요.</p>
            </div>
          ) : (
            <div className="space-y-8">
              {groups.map(([dateLabel, dayEntries]) => (
                <div key={dateLabel}>
                  <p className="text-sm font-semibold text-ink-muted mb-3">{dateLabel}</p>
                  <div className="space-y-3">
                    {dayEntries.map((entry) => (
                      <div
                        key={entry.id}
                        className={`flex ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div className="max-w-[85%]">
                          <div
                            className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                              entry.role === 'user'
                                ? 'bg-navy text-white'
                                : 'bg-white text-navy shadow-card'
                            }`}
                          >
                            {entry.content}
                          </div>
                          <p
                            className={`text-xs text-ink-faint mt-1 ${
                              entry.role === 'user' ? 'text-right' : 'text-left'
                            }`}
                          >
                            {formatTime(entry.timestamp)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </ProtectedShell>
  );
}
