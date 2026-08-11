import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/authOptions";
import { prisma } from "@/lib/db/prisma";

function formatQuotedAt(date: Date): string {
  const days = Math.round((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return "오늘";
  if (days === 1) return "어제";
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

/**
 * "내 추억" - 대화 중 회상 매칭으로 사진이 떠올랐을 때 환자가 실제로 한 말을 그 사진과
 * 함께 모아 보여준다(lib/memory/photoContext.ts가 채워 넣음). 보호자용 화면이 아니라
 * 환자 본인이 자기 회상을 다시 보는 화면이다 - 그래서 대화 없이도 조용히 사진과 자기
 * 말을 다시 보는 것만으로 끝나도 된다.
 */
export default async function MemoriesPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  if (session.user.role === "guardian") {
    redirect("/guardian");
  }

  const photos = await prisma.photo.findMany({
    where: { patientId: session.user.id, patientQuote: { not: null } },
    orderBy: { quotedAt: "desc" },
    take: 30,
    select: { id: true, url: true, caption: true, patientQuote: true, quotedAt: true },
  });

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-surface-border px-6 py-4">
        <h1 className="text-xl font-bold tracking-tight text-accent">내 추억</h1>
        <Link href="/" className="text-sm text-muted-foreground underline underline-offset-2">
          대화로 돌아가기
        </Link>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-8">
        {photos.length === 0 ? (
          <p className="text-center text-muted-foreground">
            아직 모인 추억이 없어요. 사진을 보면서 이야기를 나누면 여기에 쌓여요.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {photos.map((photo) => (
              <div key={photo.id} className="flex flex-col gap-3 rounded-lg border border-surface-border bg-surface p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url}
                  alt={photo.caption ?? "추억 사진"}
                  className="w-full rounded-xl object-cover"
                />
                <p className="text-lg leading-relaxed">&ldquo;{photo.patientQuote}&rdquo;</p>
                {photo.quotedAt && (
                  <p className="text-xs text-muted-foreground">{formatQuotedAt(photo.quotedAt)}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
