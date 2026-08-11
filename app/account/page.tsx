"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { VoiceEnrollment } from "@/components/VoiceEnrollment";

const DEFAULT_WAKE_WORD = "복실아";

export default function AccountPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [wakeWord, setWakeWord] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (session?.user?.role !== "patient") return;
    void (async () => {
      try {
        const response = await fetch("/api/auth/invite");
        if (!response.ok) return;
        const data = (await response.json()) as { inviteCode?: string | null };
        setInviteCode(data.inviteCode ?? null);
      } catch {
        // 초대 코드는 부가 정보이므로 실패해도 화면은 그대로 둔다.
      }
    })();
    void (async () => {
      try {
        const response = await fetch("/api/patient/wake-word");
        const data = (await response.json()) as { wakeWord?: string | null };
        setWakeWord(data.wakeWord ?? DEFAULT_WAKE_WORD);
      } catch {
        setWakeWord(DEFAULT_WAKE_WORD);
      }
    })();
  }, [session?.user?.role]);

  if (status === "loading") {
    return <p className="p-8 text-muted-foreground">불러오는 중...</p>;
  }

  const isPatient = session?.user?.role === "patient";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-surface-border px-6 py-4">
        <h1 className="text-xl font-bold tracking-tight text-accent">내 계정</h1>
        <Link
          href={isPatient ? "/" : "/guardian"}
          className="text-sm text-muted-foreground underline underline-offset-2"
        >
          돌아가기
        </Link>
      </header>

      <main className="mx-auto w-full max-w-md flex-1 px-6 py-8">
        <div className="rounded-lg border border-surface-border bg-surface p-5">
          <p className="text-lg font-semibold">{session?.user?.name}</p>
          <p className="text-sm text-muted-foreground">{session?.user?.email}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {isPatient ? "환자 계정" : "보호자 계정"}
          </p>
        </div>

        {isPatient && (
          <div className="mt-4">
            <VoiceEnrollment />
          </div>
        )}

        {isPatient && (
          <div className="mt-4 rounded-lg border border-surface-border bg-surface p-5">
            <p className="font-semibold">호출어</p>
            <p className="mt-1 text-sm text-muted-foreground">
              지금은 &ldquo;{wakeWord ?? DEFAULT_WAKE_WORD}&rdquo;라고 부르면 앱이 켜져요. 다른 이름으로
              바꾸고 싶으면 가족(보호자)이 보호자 앱의 설정에서 바꿀 수 있어요.
            </p>
          </div>
        )}

        {isPatient && (
          <div className="mt-4 rounded-lg border border-surface-border bg-surface p-5">
            <p className="font-semibold">보호자 초대 코드</p>
            <p className="mt-1 text-sm text-muted-foreground">
              이 코드를 가족에게 알려주면, 가족이 대화 기록을 볼 수 있습니다.
            </p>
            <p className="mt-3 text-center text-2xl font-bold tracking-widest text-accent">
              {inviteCode ?? "—"}
            </p>
          </div>
        )}

        {!isPatient && (
          <Link
            href="/guardian/link"
            className="mt-4 block rounded-lg border border-surface-border bg-surface p-5 transition hover:border-accent/50"
          >
            <p className="font-semibold">환자 연동하기</p>
            <p className="mt-1 text-sm text-muted-foreground">초대 코드로 환자를 추가합니다.</p>
          </Link>
        )}

        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="mt-6 w-full rounded-full border border-surface-border px-6 py-3 text-muted-foreground transition hover:border-danger-border hover:text-danger-foreground"
        >
          로그아웃
        </button>
      </main>
    </div>
  );
}
