"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { FamilyMemberSummary } from "@/components/guardian/FamilyMemberCard";

export function FamilySummaryCard({ patientId }: { patientId: string }) {
  const [members, setMembers] = useState<FamilyMemberSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/guardian/family?patientId=${patientId}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setMembers(data.members ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  return (
    <Link
      href="/guardian/family"
      className="animate-card-rise flex flex-col gap-3 rounded-lg border border-surface-border bg-surface p-5 transition hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-md"
    >
      <h3 className="font-semibold">가족 구성원</h3>
      {members.length === 0 ? (
        <p className="text-muted-foreground">등록된 가족이 없습니다.</p>
      ) : (
        <div className="flex items-center gap-2">
          <div className="flex -space-x-2">
            {members.slice(0, 4).map((member) =>
              member.photos[0]?.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={member.id}
                  src={member.photos[0].url}
                  alt=""
                  className="h-8 w-8 rounded-full border-2 border-surface object-cover"
                />
              ) : (
                <span
                  key={member.id}
                  className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-surface bg-background text-sm"
                >
                  👤
                </span>
              ),
            )}
          </div>
          <p className="text-sm text-muted-foreground">{members.length}명 등록됨</p>
        </div>
      )}
    </Link>
  );
}
