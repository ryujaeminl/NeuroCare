"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MemoryForm, type MemoryFormValue } from "@/components/guardian/MemoryForm";

interface MemberDetail {
  id: string;
  patientId: string;
  name: string;
  relation: string;
  birthYear: number | null;
  memories: MemoryFormValue[];
  photos: { id: string; url: string; caption: string | null }[];
}

interface FamilyMemberOption {
  id: string;
  name: string;
}

export default function FamilyMemberDetailPage() {
  const params = useParams<{ memberId: string }>();
  const router = useRouter();
  const [member, setMember] = useState<MemberDetail | null>(null);
  const [siblings, setSiblings] = useState<FamilyMemberOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showMemoryForm, setShowMemoryForm] = useState(false);
  const [editingMemory, setEditingMemory] = useState<MemoryFormValue | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const response = await fetch(`/api/guardian/family/${params.memberId}`);
        const data = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          setError(data.error ?? "구성원 정보를 불러오지 못했습니다.");
          return;
        }
        setMember(data.member);
        setError(null);

        const familyResponse = await fetch(`/api/guardian/family?patientId=${data.member.patientId}`);
        const familyData = await familyResponse.json();
        if (!cancelled && familyResponse.ok) {
          setSiblings((familyData.members ?? []).map((m: FamilyMemberOption) => ({ id: m.id, name: m.name })));
        }
      } catch {
        if (!cancelled) setError("구성원 정보를 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [params.memberId]);

  async function handleDeleteMember() {
    if (!member || !confirm(`${member.name}님 정보를 삭제할까요? 등록된 기억/사진은 인물 연결만 끊어집니다.`)) return;
    const response = await fetch(`/api/guardian/family/${member.id}`, { method: "DELETE" });
    if (response.ok) router.push("/guardian/family");
  }

  async function handleDeleteMemory(id: string) {
    if (!confirm("이 기억을 삭제할까요?")) return;
    const response = await fetch(`/api/guardian/memories/${id}`, { method: "DELETE" });
    if (response.ok) setMember((prev) => (prev ? { ...prev, memories: prev.memories.filter((m) => m.id !== id) } : prev));
  }

  function handleMemorySaved(memory: MemoryFormValue) {
    setMember((prev) => {
      if (!prev) return prev;
      const exists = prev.memories.some((m) => m.id === memory.id);
      return {
        ...prev,
        memories: exists ? prev.memories.map((m) => (m.id === memory.id ? memory : m)) : [memory, ...prev.memories],
      };
    });
    setShowMemoryForm(false);
    setEditingMemory(null);
  }

  if (loading) return <p className="text-muted-foreground">불러오는 중...</p>;
  if (error) return <p className="text-danger-foreground">{error}</p>;
  if (!member) return null;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/guardian/family" className="text-sm text-muted-foreground underline underline-offset-2">
        ← 가족 목록으로
      </Link>

      <div className="flex items-center justify-between rounded-2xl border border-surface-border bg-surface p-5">
        <div>
          <h2 className="text-xl font-bold">{member.name}</h2>
          <p className="text-muted-foreground">
            {member.relation}
            {member.birthYear && ` · ${member.birthYear}년생`}
          </p>
        </div>
        <button
          type="button"
          onClick={handleDeleteMember}
          className="text-sm text-danger-foreground underline underline-offset-2"
        >
          구성원 삭제
        </button>
      </div>

      {member.photos.length > 0 && (
        <section>
          <h3 className="mb-3 font-semibold">사진</h3>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {member.photos.map((photo) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={photo.id} src={photo.url} alt={photo.caption ?? ""} className="aspect-square rounded-xl object-cover" />
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">기억</h3>
          {!showMemoryForm && (
            <button
              type="button"
              onClick={() => {
                setEditingMemory(null);
                setShowMemoryForm(true);
              }}
              className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:brightness-110"
            >
              + 기억 추가
            </button>
          )}
        </div>

        {showMemoryForm && (
          <MemoryForm
            patientId={member.patientId}
            familyMembers={siblings}
            defaultFamilyMemberId={member.id}
            initial={editingMemory ?? undefined}
            onSaved={handleMemorySaved}
            onCancel={() => {
              setShowMemoryForm(false);
              setEditingMemory(null);
            }}
          />
        )}

        {member.memories.length === 0 ? (
          <p className="text-muted-foreground">등록된 기억이 없습니다.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {member.memories.map((memory) => (
              <div key={memory.id} className="rounded-2xl border border-surface-border bg-surface p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold">{memory.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{memory.content}</p>
                    {memory.dateOccurred && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {new Date(memory.dateOccurred).toLocaleDateString("ko-KR")}
                      </p>
                    )}
                    {memory.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {memory.tags.map((tag) => (
                          <span key={tag} className="rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2 text-sm">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingMemory(memory);
                        setShowMemoryForm(true);
                      }}
                      className="text-accent underline underline-offset-2"
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteMemory(memory.id)}
                      className="text-danger-foreground underline underline-offset-2"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
