import { loadFromStorage, saveToStorage } from './storage';

export interface Session {
  username: string;
  name: string;
  patientId: string;
}

const SESSION_KEY = 'memoria_session';

export function getSession(): Session | null {
  return loadFromStorage<Session | null>(SESSION_KEY, null);
}

export function saveSession(session: Session) {
  saveToStorage(SESSION_KEY, session);
}

export function clearSession() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(SESSION_KEY);
}
