import { loadFromStorage, saveToStorage } from './storage';

export interface HistoryEntry {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

const HISTORY_KEY = 'memoria_chat_history';
const MAX_ENTRIES = 500;

export function getHistory(): HistoryEntry[] {
  return loadFromStorage<HistoryEntry[]>(HISTORY_KEY, []);
}

export function appendHistory(entry: { role: 'user' | 'assistant'; content: string }) {
  if (!entry.content.trim()) return;
  const history = getHistory();
  const newEntry: HistoryEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role: entry.role,
    content: entry.content,
    timestamp: Date.now(),
  };
  const updated = [...history, newEntry].slice(-MAX_ENTRIES);
  saveToStorage(HISTORY_KEY, updated);
  return updated;
}

export function clearHistory() {
  saveToStorage(HISTORY_KEY, []);
}

export function groupHistoryByDate(entries: HistoryEntry[]) {
  const groups = new Map<string, HistoryEntry[]>();
  for (const entry of entries) {
    const dateKey = new Date(entry.timestamp).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'short',
    });
    if (!groups.has(dateKey)) groups.set(dateKey, []);
    groups.get(dateKey)!.push(entry);
  }
  return Array.from(groups.entries());
}
