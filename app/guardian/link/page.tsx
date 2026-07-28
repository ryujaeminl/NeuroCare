"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState } from "react";

export default function GuardianLinkPage() {
  const router = useRouter();
  const { update } = useSession();
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "연동에 실패했습니다.");
        return;
      }

      // 세션의 linkedPatientIds를 갱신해야 새 환자 기록에 접근할 수 있다.
      await update();
      router.push("/guardian");
      router.refresh();
    } catch {
      setError("연동에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex justify-center py-4">
      <div className="w-full max-w-sm">
        <h1 className="text-center text-2xl font-bold tracking-tight text-accent">환자 연동하기</h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          환자분 계정에서 확인한 초대 코드를 입력하세요.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
          <input
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
            placeholder="NEURO-XXXXXX"
            required
            className="rounded-xl border border-surface-border bg-surface px-4 py-3 text-center text-lg tracking-widest outline-none focus:border-accent"
          />

          {error && <p className="text-sm text-danger-foreground">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="rounded-full bg-accent px-6 py-4 text-lg font-medium text-accent-foreground transition hover:brightness-110 disabled:opacity-50"
          >
            {submitting ? "연동 중..." : "연동하기"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm">
          <Link href="/guardian" className="text-muted-foreground underline underline-offset-2">
            대시보드로 돌아가기
          </Link>
        </p>
      </div>
    </div>
  );
}
