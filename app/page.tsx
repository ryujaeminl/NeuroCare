"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useConversationEngine } from "@/hooks/useConversationEngine";
import { EmergencyButton } from "@/components/EmergencyButton";
import { ProgressRing } from "@/components/ProgressRing";
import { TodayMoodCard } from "@/components/TodayMoodCard";

interface DashboardCardProps {
  icon: string;
  iconClassName: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}

function DashboardCard({ icon, iconClassName, title, description, children }: DashboardCardProps) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-surface-border bg-surface p-5 text-left">
      <span className={`flex h-10 w-10 items-center justify-center rounded-lg text-lg ${iconClassName}`}>
        {icon}
      </span>
      <div>
        <p className="font-semibold">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

const DEFAULT_SUBTITLE = "오늘도 기분 좋은 하루네요. 필요한 것이 있다면 언제든 말씀해주세요.";

export default function HomePage() {
  const [medsDismissed, setMedsDismissed] = useState(false);
  const { data: session, status } = useSession();
  const router = useRouter();

  // 로그인 없이는 마이크도, 기분/기록 조회도 전부 401만 반복된다 - 대시보드를 보여주기 전에
  // 먼저 로그인부터 시키는 게 맞다. status가 "loading"인 동안은 아직 세션 확인 중이라
  // 섣불리 리다이렉트하지 않는다.
  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  // 로그인한 환자 계정일 때만 대화를 서버에 저장한다(보호자는 읽기 전용).
  const engine = useConversationEngine({ persist: session?.user?.role === "patient" });

  // 버튼도 웨이크워드도 없이, 이 화면에서 그냥 말하면 바로 대화가 이어진다.
  // 대시보드 레이아웃은 그대로 두고, 인사말 아래 안내 문구만 지금 상태를 보여주도록 바꾼다.
  let subtitle = DEFAULT_SUBTITLE;
  if (engine.phase === "transcribing" || engine.phase === "waiting-more") {
    subtitle = engine.interimText || "듣고 있어요...";
  } else if (engine.phase === "thinking") {
    subtitle = "생각하는 중...";
  } else if (engine.phase === "speaking") {
    subtitle = engine.assistantDraft || "답하는 중...";
  } else if (engine.vadUserSpeaking) {
    subtitle = "듣고 있어요...";
  } else if (engine.log.length > 0) {
    // 턴이 끝나도 방금 오간 말이 자막처럼 남아있어야 한다. 여기서 안 잡으면
    // 매번 인삿말로 되돌아가 대화가 계속 안 되는 것처럼 보인다.
    subtitle = engine.log[0].text;
  }

  const mascotGlow = engine.vadUserSpeaking
    ? "bg-emerald-400/25"
    : engine.phase === "thinking" || engine.phase === "speaking"
      ? "bg-accent/25"
      : engine.vadListening
        ? "bg-accent/10"
        : "bg-transparent";

  // 로그인 확인 중이거나 로그인 화면으로 넘어가는 중에는 대시보드가 잠깐이라도 보이면 안 된다.
  if (status !== "authenticated") {
    return <div className="min-h-screen" />;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-surface-border px-6 py-4">
        <h1 className="text-xl font-bold tracking-tight text-accent">뉴로케어</h1>
        <div className="flex items-center gap-4 text-muted-foreground">
          <Link
            href="/history"
            aria-label="대화 기록"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-surface-border text-lg transition hover:border-accent"
          >
            📖
          </Link>
          <Link
            href={session ? "/account" : "/login"}
            aria-label={session ? "내 계정" : "로그인"}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-surface-border text-lg transition hover:border-accent"
          >
            👤
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-6 py-10">
        <section className="flex flex-col items-center gap-4 text-center">
          <div className="relative flex items-center justify-center overflow-hidden rounded-2xl bg-white">
            <div className={`absolute inset-0 rounded-2xl blur-xl transition ${mascotGlow}`} aria-hidden />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mascot-dog.png" alt="" className="relative h-56 w-56 object-contain p-4" />
          </div>

          <div>
            <h2 className="text-2xl font-bold">안녕하세요! 무엇을 도와드릴까요?</h2>
            <p className="mt-2 text-muted-foreground">{subtitle}</p>
            {/* 마이크가 잡히지 않으면 대화가 통째로 죽는데 지금까지 화면에 아무 표시가 없었다. */}
            {(engine.errorMsg ?? engine.vadError) && (
              <p className="mt-1 text-sm text-danger-foreground">
                {engine.vadError ? `마이크를 사용할 수 없습니다: ${engine.vadError}` : engine.errorMsg}
              </p>
            )}
          </div>
        </section>

        {engine.photo && (
          <div className="relative mx-auto flex w-full max-w-md flex-col gap-2 rounded-2xl border border-surface-border bg-surface p-4">
            <button
              onClick={engine.dismissPhoto}
              aria-label="사진 닫기"
              className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-background text-sm"
            >
              ✕
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={engine.photo.url} alt={engine.photo.caption ?? "가족 사진"} className="w-full rounded-xl object-cover" />
            {engine.photo.caption && <p className="text-center text-sm text-muted-foreground">{engine.photo.caption}</p>}
          </div>
        )}

        {!medsDismissed && (
          <div className="flex items-center justify-between gap-4 rounded-2xl border-2 border-rose-400/60 bg-danger-bg px-5 py-4">
            <div className="flex items-center gap-3 text-left">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-500 text-lg">
                💊
              </span>
              <div>
                <p className="text-xs font-medium text-rose-300">중요한 알림</p>
                <p className="font-semibold">오후 약 복용 시간입니다</p>
                <p className="text-sm text-muted-foreground">혈압약과 비타민을 챙겨 드실 시간이에요.</p>
              </div>
            </div>
            <button
              onClick={() => setMedsDismissed(true)}
              className="shrink-0 rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:brightness-110"
            >
              확인했습니다
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <DashboardCard
            icon="👪"
            iconClassName="bg-emerald-500/20 text-emerald-300"
            title="가족 연결"
            description="가족들의 최근 소식과 사진을 확인해보세요."
          >
            <div className="flex items-center -space-x-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-surface bg-amber-200 text-sm">
                👵
              </span>
              <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-surface bg-sky-200 text-sm">
                👴
              </span>
              <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-surface bg-accent text-xs font-semibold text-accent-foreground">
                +2
              </span>
            </div>
          </DashboardCard>

          <DashboardCard
            icon="📋"
            iconClassName="bg-sky-500/20 text-sky-300"
            title="오늘의 계획"
            description="오후 3시에 산책 예약이 있습니다."
          >
            <span className="text-sm font-medium text-accent">일정 더 보기 →</span>
          </DashboardCard>

          <TodayMoodCard refreshKey={engine.log.length} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-surface-border bg-surface p-5">
            <div className="flex flex-col gap-4">
              <p className="font-semibold">활동 요약</p>
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">
                  🚶
                </span>
                <div>
                  <p className="font-semibold">3,240 걸음</p>
                  <p className="text-xs text-muted-foreground">목표까지 1,760 걸음 남음</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-500/20 text-sky-300">
                  🌙
                </span>
                <div>
                  <p className="font-semibold">7시간 20분</p>
                  <p className="text-xs text-muted-foreground">매우 깊은 수면 상태</p>
                </div>
              </div>
            </div>
            <ProgressRing percent={70} />
          </div>

          <div className="flex flex-col gap-3 rounded-2xl border border-surface-border bg-surface p-5">
            <p className="font-semibold">가족 메시지</p>
            <p className="text-muted-foreground">
              &ldquo;할아버지, 이번 주말에 맛있는 거 먹으러 가요! 사랑해요.&rdquo; - 지민
            </p>
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-background text-sm">
                  📹
                </span>
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-background text-sm">
                  💬
                </span>
              </div>
              <span className="text-xs text-muted-foreground">5분 전</span>
            </div>
          </div>
        </div>
      </main>

      {session?.user?.role === "patient" && <EmergencyButton />}
    </div>
  );
}
