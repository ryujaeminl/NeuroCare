import Link from "next/link";

export interface FamilyMemberSummary {
  id: string;
  name: string;
  relation: string;
  birthYear: number | null;
  photos: { url: string }[];
  _count: { memories: number; photos: number };
}

export function FamilyMemberCard({ member }: { member: FamilyMemberSummary }) {
  const photo = member.photos[0]?.url;

  return (
    <Link
      href={`/guardian/family/${member.id}`}
      className="animate-card-rise flex flex-col items-center gap-3 rounded-lg border border-surface-border bg-surface p-5 text-center transition hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-md"
    >
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" className="h-20 w-20 rounded-full object-cover" />
      ) : (
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-background text-2xl">👤</div>
      )}
      <div>
        <p className="font-semibold">{member.name}</p>
        <p className="text-sm text-muted-foreground">
          {member.relation}
          {member.birthYear && ` · ${member.birthYear}년생`}
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        기억 {member._count.memories}개 · 사진 {member._count.photos}장
      </p>
    </Link>
  );
}
