"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState } from "react";
import type { UserRole } from "@/lib/db/types";

export default function SignupPage() {
  const router = useRouter();
  const [role, setRole] = useState<UserRole>("patient");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name, role }),
    });
    const data = await response.json();

    if (!response.ok) {
      setError(data.error ?? "가입에 실패했습니다.");
      setSubmitting(false);
      return;
    }

    await signIn("credentials", { email, password, redirect: false });
    router.push(role === "guardian" ? "/guardian" : "/");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm">
        <h1 className="text-center text-2xl font-bold tracking-tight text-accent">회원가입</h1>

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-sm text-muted-foreground">누구신가요?</span>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { value: "patient", label: "본인 (환자)" },
                  { value: "guardian", label: "보호자" },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setRole(option.value)}
                  className={`rounded-xl border px-4 py-3 transition ${
                    role === option.value
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-surface-border bg-surface text-muted-foreground"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-2">
            <span className="text-sm text-muted-foreground">이름</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="rounded-xl border border-surface-border bg-surface px-4 py-3 text-lg outline-none focus:border-accent"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm text-muted-foreground">{role === "patient" ? "아이디" : "이메일"}</span>
            <input
              type={role === "patient" ? "text" : "email"}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete={role === "patient" ? "username" : "email"}
              className="rounded-xl border border-surface-border bg-surface px-4 py-3 text-lg outline-none focus:border-accent"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm text-muted-foreground">비밀번호 (8자 이상)</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="rounded-xl border border-surface-border bg-surface px-4 py-3 text-lg outline-none focus:border-accent"
            />
          </label>

          {error && <p className="text-sm text-danger-foreground">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 rounded-full bg-accent px-6 py-4 text-lg font-medium text-accent-foreground transition hover:brightness-110 disabled:opacity-50"
          >
            {submitting ? "가입 중..." : "가입하기"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          이미 계정이 있으신가요?{" "}
          <Link href="/login" className="text-accent underline underline-offset-2">
            로그인
          </Link>
        </p>
      </div>
    </main>
  );
}
