'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { HelpIcon, UserCircleIcon, HistoryIcon } from '@/components/icons';
import { getSession, clearSession, type Session } from '@/lib/session';

interface AppHeaderProps {
  showGuardianLink?: boolean;
}

export default function AppHeader({ showGuardianLink = false }: AppHeaderProps) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setSession(getSession());
  }, []);

  const logout = () => {
    clearSession();
    router.push('/login');
  };

  return (
    <header className="sticky top-0 z-20 bg-canvas/90 backdrop-blur px-5 py-4 flex items-center justify-between">
      <span className="text-2xl font-bold text-navy tracking-tight">Memoria</span>
      <div className="flex items-center gap-4">
        {showGuardianLink && (
          <span className="text-sm text-ink-muted hidden sm:inline">어머니의 공간</span>
        )}
        <Link href="/history" aria-label="대화 기록" className="text-navy/70 hover:text-navy">
          <HistoryIcon className="w-6 h-6" />
        </Link>
        <button aria-label="도움말" className="text-navy/70 hover:text-navy">
          <HelpIcon className="w-6 h-6" />
        </button>
        <div className="relative">
          <button
            aria-label="내 프로필"
            onClick={() => setMenuOpen((v) => !v)}
            className="text-navy/70 hover:text-navy"
          >
            <UserCircleIcon className="w-6 h-6" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-9 z-20 w-44 bg-white rounded-2xl shadow-soft p-3">
                <p className="text-sm font-semibold text-navy px-2 py-1 truncate">
                  {session ? `${session.name}님` : '게스트'}
                </p>
                <button
                  onClick={logout}
                  className="w-full text-left text-sm text-ink-muted px-2 py-2 rounded-xl hover:bg-canvas mt-1"
                >
                  로그아웃
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
