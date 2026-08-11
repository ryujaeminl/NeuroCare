import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/authOptions";
import { EmergencyBanner } from "@/components/guardian/EmergencyBanner";
import { FontSizeToggle } from "@/components/guardian/FontSizeToggle";

/** /guardian/* 전체의 접근 관문. 여기서 막으면 하위 페이지는 role 체크를 반복하지 않아도 된다. */
export default async function GuardianLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.user.role !== "guardian") redirect("/");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-surface-border px-4 py-3 sm:px-6">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3">
          <Link href="/guardian" className="text-xl font-bold tracking-tight text-accent">
            보호자 대시보드
          </Link>
          <nav className="flex flex-wrap items-center gap-4 text-sm">
            <Link href="/guardian/medications" className="text-muted-foreground underline underline-offset-2">
              복용약
            </Link>
            <Link href="/guardian/family" className="text-muted-foreground underline underline-offset-2">
              가족·기억
            </Link>
            <Link href="/guardian/photos" className="text-muted-foreground underline underline-offset-2">
              사진
            </Link>
            <Link href="/guardian/settings" className="text-muted-foreground underline underline-offset-2">
              설정
            </Link>
            <Link href="/guardian/link" className="text-accent underline underline-offset-2">
              환자 연동
            </Link>
            <Link href="/account" className="text-muted-foreground underline underline-offset-2">
              내 계정
            </Link>
          </nav>
          <FontSizeToggle />
        </div>
      </header>

      <EmergencyBanner />

      {/* 의료 면책 - 보호자 화면 전체에 항상 노출되어야 한다. */}
      <p className="border-b border-surface-border bg-surface px-4 py-2 text-center text-xs text-muted-foreground sm:px-6">
        이 정보는 의료적 진단이 아니며 참고용입니다.
      </p>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
