'use client';

import { useState } from 'react';
import AppHeader from '@/components/layout/AppHeader';
import ProtectedShell from '@/components/layout/ProtectedShell';
import { getReminders, saveReminders, toDisplayTime, type Reminder, type ReminderIcon } from '@/lib/reminders';
import {
  PillIcon,
  UtensilsIcon,
  FootprintsIcon,
  CheckIcon,
  CheckCircleIcon,
  PlusIcon,
  MessageIcon,
  PhoneIcon,
} from '@/components/icons';

const REMINDER_ICONS = { pill: PillIcon, utensils: UtensilsIcon, footprints: FootprintsIcon };
const ICON_OPTIONS: ReminderIcon[] = ['pill', 'utensils', 'footprints'];

export default function RemindersPage() {
  const [reminders, setReminders] = useState<Reminder[]>(getReminders);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newTime, setNewTime] = useState('09:00');
  const [newIcon, setNewIcon] = useState<ReminderIcon>('pill');
  const [notice, setNotice] = useState<string | null>(null);

  const completedCount = reminders.filter(r => r.completed).length;
  const progressPct = reminders.length ? (completedCount / reminders.length) * 100 : 0;

  const sorted = [...reminders].sort((a, b) => a.time.localeCompare(b.time));

  const toggleReminder = (id: string) => {
    const updated = reminders.map(r => (r.id === id ? { ...r, completed: !r.completed } : r));
    setReminders(updated);
    saveReminders(updated);
  };

  const addReminder = () => {
    if (!newTitle.trim()) return;
    const updated: Reminder[] = [
      ...reminders,
      {
        id: `custom-${Date.now()}`,
        time: newTime,
        timeLabel: toDisplayTime(newTime),
        icon: newIcon,
        title: newTitle.trim(),
        subtitle: '직접 추가한 일정',
        completed: false,
        accent: 'blue',
      },
    ];
    setReminders(updated);
    saveReminders(updated);
    setNewTitle('');
    setNewTime('09:00');
    setNewIcon('pill');
    setShowAddForm(false);
  };

  const showNotice = (text: string) => {
    setNotice(text);
    setTimeout(() => setNotice(null), 2500);
  };

  return (
    <ProtectedShell>
    <div className="min-h-screen flex flex-col pb-24">
      <AppHeader />

      <main className="flex-1 px-5 pt-2 space-y-5">
        <h1 className="text-2xl font-bold text-navy">오늘의 일정</h1>

        <div className="bg-white rounded-2xl shadow-card p-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-ink-muted">진행률</p>
            <p className="text-lg font-bold text-navy mt-0.5">
              {reminders.length}개 중 {completedCount}개 완료됨
            </p>
            <div className="w-40 sm:w-56 h-2 bg-mint-softer rounded-full mt-3 overflow-hidden">
              <div className="h-full bg-mint rounded-full transition-all" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
          <span className="w-12 h-12 rounded-full border-2 border-mint-soft flex items-center justify-center shrink-0">
            <CheckCircleIcon className="w-6 h-6 text-mint" />
          </span>
        </div>

        <div className="space-y-3">
          {sorted.map((reminder) => {
            const Icon = REMINDER_ICONS[reminder.icon];
            const borderColor = reminder.accent === 'green' ? 'border-l-mint' : 'border-l-sky-soft';
            return (
              <div
                key={reminder.id}
                className={`bg-white rounded-2xl shadow-card p-4 flex items-center gap-4 border-l-4 ${borderColor}`}
              >
                <button
                  onClick={() => toggleReminder(reminder.id)}
                  aria-label={reminder.completed ? '완료 취소' : '완료로 표시'}
                  className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 border-2 ${
                    reminder.completed ? 'bg-mint border-mint' : 'border-ink-faint'
                  }`}
                >
                  {reminder.completed && <CheckIcon className="w-4 h-4 text-white" />}
                </button>

                <span className="w-10 h-10 rounded-full bg-canvas flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-navy" />
                </span>

                <div className="flex-1 min-w-0">
                  <p className="text-xs text-ink-muted">{reminder.timeLabel}</p>
                  <p className="font-bold text-navy truncate">{reminder.title}</p>
                  <p className="text-xs text-ink-muted truncate">{reminder.subtitle}</p>
                </div>

                {reminder.completed && (
                  <span className="text-xs font-semibold text-mint shrink-0">완료됨</span>
                )}
              </div>
            );
          })}
        </div>

        {showAddForm && (
          <div className="bg-white rounded-2xl shadow-card p-4 space-y-3">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="일정 이름 (예: 물리치료 가기)"
              className="w-full px-3 py-2.5 rounded-xl bg-canvas text-navy placeholder:text-ink-faint focus:outline-none"
            />
            <div className="flex items-center gap-3">
              <input
                type="time"
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
                className="px-3 py-2.5 rounded-xl bg-canvas text-navy focus:outline-none"
              />
              <div className="flex gap-2">
                {ICON_OPTIONS.map((opt) => {
                  const OptIcon = REMINDER_ICONS[opt];
                  return (
                    <button
                      key={opt}
                      onClick={() => setNewIcon(opt)}
                      className={`w-9 h-9 rounded-full flex items-center justify-center ${
                        newIcon === opt ? 'bg-mint text-white' : 'bg-canvas text-navy'
                      }`}
                    >
                      <OptIcon className="w-4 h-4" />
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 rounded-full text-sm text-ink-muted"
              >
                취소
              </button>
              <button
                onClick={addReminder}
                disabled={!newTitle.trim()}
                className="px-4 py-2 rounded-full bg-navy text-white text-sm font-semibold disabled:opacity-40"
              >
                추가
              </button>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-card p-5 flex items-start gap-4 flex-wrap">
          <div className="relative shrink-0">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-mint to-navy-light flex items-center justify-center text-white font-bold">
              지
            </div>
            <span className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-mint border-2 border-white" />
          </div>
          <div className="flex-1 min-w-[220px]">
            <p className="font-bold text-navy">보호자와 연결되어 있습니다</p>
            <p className="text-sm text-ink-muted mt-1">
              &quot;어머니, 오늘 오전 약 잘 챙겨드셨네요! 오후 산책도 잊지 마세요.&quot; - 딸 김지은
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => showNotice('딸 김지은님에게 메시지를 보냈어요.')}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-mint text-white text-sm font-semibold"
              >
                <MessageIcon className="w-4 h-4" />
                메시지 보내기
              </button>
              <button
                onClick={() => showNotice('딸 김지은님에게 전화를 겁니다...')}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-navy/15 text-navy text-sm font-semibold"
              >
                <PhoneIcon className="w-4 h-4" />
                전화하기
              </button>
            </div>
          </div>
        </div>
      </main>

      <button
        onClick={() => setShowAddForm(true)}
        aria-label="일정 추가"
        className="fixed bottom-24 right-5 w-14 h-14 rounded-full bg-navy text-white shadow-soft flex items-center justify-center z-30"
      >
        <PlusIcon className="w-6 h-6" />
      </button>

      {notice && (
        <div className="fixed bottom-40 left-0 right-0 flex justify-center px-5 z-30">
          <div className="bg-navy text-white text-sm px-4 py-2.5 rounded-full shadow-soft">{notice}</div>
        </div>
      )}
    </div>
    </ProtectedShell>
  );
}
