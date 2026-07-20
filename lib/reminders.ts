import { loadFromStorage, saveToStorage } from './storage';

export type ReminderIcon = 'pill' | 'utensils' | 'footprints';
export type ReminderAccent = 'green' | 'blue';

export interface Reminder {
  id: string;
  time: string; // "HH:mm", 24h, for sorting
  timeLabel: string; // "오전 08:30"
  icon: ReminderIcon;
  title: string;
  subtitle: string;
  completed: boolean;
  accent: ReminderAccent;
}

const REMINDERS_KEY = 'memoria_reminders';
const REMINDERS_DATE_KEY = 'memoria_reminders_date';

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function seedReminders(): Reminder[] {
  return [
    {
      id: 'morning-meds',
      time: '08:30',
      timeLabel: '오전 08:30',
      icon: 'pill',
      title: '아침 약 복용',
      subtitle: '고혈압 약, 오메가3 (식후 30분)',
      completed: true,
      accent: 'green',
    },
    {
      id: 'lunch',
      time: '12:30',
      timeLabel: '오후 12:30',
      icon: 'utensils',
      title: '점심 식사',
      subtitle: '단백질 위주의 식단 권장',
      completed: false,
      accent: 'blue',
    },
    {
      id: 'walk',
      time: '16:00',
      timeLabel: '오후 04:00',
      icon: 'footprints',
      title: '가벼운 산책',
      subtitle: '공원 20분 걷기, 모자 지참',
      completed: false,
      accent: 'green',
    },
    {
      id: 'evening-meds',
      time: '21:00',
      timeLabel: '오후 09:00',
      icon: 'pill',
      title: '저녁 약 복용',
      subtitle: '수면 보조 영양제',
      completed: false,
      accent: 'blue',
    },
  ];
}

export function getReminders(): Reminder[] {
  const storedDate = loadFromStorage<string | null>(REMINDERS_DATE_KEY, null);
  const today = todayKey();

  if (storedDate !== today) {
    const seeded = seedReminders();
    saveToStorage(REMINDERS_KEY, seeded);
    saveToStorage(REMINDERS_DATE_KEY, today);
    return seeded;
  }

  return loadFromStorage<Reminder[]>(REMINDERS_KEY, seedReminders());
}

export function saveReminders(reminders: Reminder[]) {
  saveToStorage(REMINDERS_KEY, reminders);
  saveToStorage(REMINDERS_DATE_KEY, todayKey());
}

export function toDisplayTime(time: string) {
  const [hStr, m] = time.split(':');
  const h = parseInt(hStr, 10);
  const period = h < 12 ? '오전' : '오후';
  const displayH = h % 12 === 0 ? 12 : h % 12;
  return `${period} ${String(displayH).padStart(2, '0')}:${m}`;
}
