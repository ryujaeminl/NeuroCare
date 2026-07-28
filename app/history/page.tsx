import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/authOptions";
import { HistoryView } from "@/components/HistoryView";

export default async function HistoryPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  // 보호자는 환자를 먼저 고르는 대시보드로 보낸다.
  if (session.user.role === "guardian") {
    redirect("/guardian");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-surface-border px-6 py-4">
        <h1 className="text-xl font-bold tracking-tight text-accent">대화 기록</h1>
        <Link href="/" className="text-sm text-muted-foreground underline underline-offset-2">
          대화로 돌아가기
        </Link>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-8">
        <HistoryView />
      </main>
    </div>
  );
}
