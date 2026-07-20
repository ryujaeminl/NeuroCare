'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { saveSession } from '@/lib/session';
import { RobotIcon } from '@/components/icons';

type Mode = 'login' | 'signup';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
  };

  const submit = async () => {
    if (loading) return;
    setError('');

    if (!username.trim() || !password.trim() || (mode === 'signup' && !name.trim())) {
      setError('모든 항목을 입력해주세요.');
      return;
    }

    setLoading(true);
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/signup';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, name }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || '요청에 실패했어요.');
      }

      saveSession(data.user);
      router.push('/');
    } catch (err: any) {
      setError(err.message || '요청에 실패했어요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas px-5">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 rounded-3xl bg-white shadow-soft flex items-center justify-center mb-4">
            <RobotIcon className="w-9 h-9 text-navy" />
          </div>
          <h1 className="text-2xl font-bold text-navy">Memoria</h1>
          <p className="text-sm text-ink-muted mt-1">
            {mode === 'login' ? '다시 만나서 반가워요' : '처음 뵙겠습니다, 함께해요'}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-card p-5 space-y-3">
          {mode === 'signup' && (
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="이름"
              className="w-full px-4 py-3.5 rounded-xl bg-canvas text-navy placeholder:text-ink-faint focus:outline-none text-base"
            />
          )}
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="아이디"
            autoCapitalize="none"
            className="w-full px-4 py-3.5 rounded-xl bg-canvas text-navy placeholder:text-ink-faint focus:outline-none text-base"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="비밀번호"
            className="w-full px-4 py-3.5 rounded-xl bg-canvas text-navy placeholder:text-ink-faint focus:outline-none text-base"
          />

          {error && <p className="text-sm text-red-500 px-1">{error}</p>}

          <button
            onClick={submit}
            disabled={loading}
            className="w-full py-3.5 rounded-xl bg-navy text-white font-semibold text-base disabled:opacity-50"
          >
            {loading ? '처리 중...' : mode === 'login' ? '로그인' : '회원가입'}
          </button>
        </div>

        <p className="text-center text-sm text-ink-muted mt-5">
          {mode === 'login' ? (
            <>
              아직 계정이 없으신가요?{' '}
              <button onClick={() => switchMode('signup')} className="font-semibold text-navy">
                회원가입
              </button>
            </>
          ) : (
            <>
              이미 계정이 있으신가요?{' '}
              <button onClick={() => switchMode('login')} className="font-semibold text-navy">
                로그인
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
