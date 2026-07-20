'use client';

import { useEffect, useState } from 'react';
import AppHeader from '@/components/layout/AppHeader';
import ProtectedShell from '@/components/layout/ProtectedShell';
import { loadFromStorage, saveToStorage } from '@/lib/storage';
import { SmileIcon, HeartIcon, CheckCircleIcon } from '@/components/icons';

type Mood = '좋아요' | '보통이에요' | '힘들어요';

const MOODS: Mood[] = ['좋아요', '보통이에요', '힘들어요'];

const HEALTH_LOG = [
  { label: '어젯밤 수면', value: '6시간 40분', note: '평소보다 조금 적어요' },
  { label: '오늘 걸음 수', value: '1,840보', note: '가벼운 산책이면 충분해요' },
  { label: '최근 혈압', value: '128 / 82', note: '어제 오전 8시 30분 측정' },
];

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export default function CarePage() {
  const [mood, setMood] = useState<Mood | null>(null);

  useEffect(() => {
    const stored = loadFromStorage<{ date: string; mood: Mood } | null>('memoria_mood', null);
    if (stored && stored.date === todayKey()) {
      setMood(stored.mood);
    }
  }, []);

  const pickMood = (m: Mood) => {
    setMood(m);
    saveToStorage('memoria_mood', { date: todayKey(), mood: m });
  };

  return (
    <ProtectedShell>
    <div className="min-h-screen flex flex-col pb-24">
      <AppHeader />

      <main className="flex-1 px-5 pt-2 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-navy">건강 관리</h1>
          <p className="text-sm text-ink-muted mt-1">오늘 컨디션을 기록하고 몸 상태를 확인해보세요.</p>
        </div>

        <div className="bg-white rounded-2xl shadow-card p-5">
          <div className="flex items-center gap-3 mb-4">
            <span className="w-11 h-11 rounded-full bg-sand-soft flex items-center justify-center">
              <SmileIcon className="w-5 h-5 text-navy" />
            </span>
            <div>
              <p className="font-bold text-navy">오늘 기분이 어떠세요?</p>
              <p className="text-xs text-ink-muted">매일 한 번, 기분을 기록해보세요.</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {MOODS.map((m) => (
              <button
                key={m}
                onClick={() => pickMood(m)}
                className={`py-2.5 rounded-full text-sm font-semibold transition-colors ${
                  mood === m ? 'bg-mint text-white' : 'bg-canvas text-navy'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          {mood && (
            <p className="text-sm text-ink-muted mt-3">
              오늘은 <span className="font-semibold text-navy">&quot;{mood}&quot;</span>라고 기록했어요.
            </p>
          )}
        </div>

        <div>
          <h2 className="text-lg font-bold text-navy mb-3">최근 건강 기록</h2>
          <div className="space-y-3">
            {HEALTH_LOG.map((item) => (
              <div key={item.label} className="bg-white rounded-2xl shadow-card p-4 flex items-center gap-4">
                <span className="w-10 h-10 rounded-full bg-sky-soft flex items-center justify-center shrink-0">
                  <HeartIcon className="w-5 h-5 text-navy" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-ink-muted">{item.label}</p>
                  <p className="font-bold text-navy">{item.value}</p>
                </div>
                <p className="text-xs text-ink-muted text-right max-w-[40%]">{item.note}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-card p-5 flex items-center gap-4">
          <span className="w-11 h-11 rounded-full bg-mint-soft flex items-center justify-center shrink-0">
            <CheckCircleIcon className="w-5 h-5 text-mint" />
          </span>
          <p className="text-sm text-ink-muted">
            건강 기록은 보호자에게도 함께 공유되어, 가족이 어머니의 컨디션을 살펴볼 수 있어요.
          </p>
        </div>
      </main>
    </div>
    </ProtectedShell>
  );
}
