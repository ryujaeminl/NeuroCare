"use client";

import { useEffect, useState } from "react";
import { FamilyMemberCard, type FamilyMemberSummary } from "@/components/guardian/FamilyMemberCard";
import { PatientSelector } from "@/components/guardian/PatientSelector";
import { useLinkedPatients } from "@/hooks/useLinkedPatients";

export default function FamilyPage() {
  const { patients, selectedId, setSelectedId, loading: loadingPatients } = useLinkedPatients();
  const [members, setMembers] = useState<FamilyMemberSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [relation, setRelation] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;

    async function loadMembers() {
      setLoading(true);
      try {
        const response = await fetch(`/api/guardian/family?patientId=${selectedId}`);
        const data = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          setError(data.error ?? "가족 목록을 불러오지 못했습니다.");
          return;
        }
        setMembers(data.members ?? []);
        setError(null);
      } catch {
        if (!cancelled) setError("가족 목록을 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadMembers();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedId) return;
    setSubmitting(true);
    try {
      const response = await fetch("/api/guardian/family", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: selectedId,
          name,
          relation,
          birthYear: birthYear ? Number(birthYear) : null,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "등록에 실패했습니다.");
        return;
      }
      setMembers((prev) => [{ ...data.member, photos: [], _count: { memories: 0, photos: 0 } }, ...prev]);
      setName("");
      setRelation("");
      setBirthYear("");
      setShowForm(false);
    } catch {
      setError("등록에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingPatients) return <p className="text-muted-foreground">불러오는 중...</p>;
  if (patients.length === 0) {
    return <p className="text-muted-foreground">연동된 환자가 없습니다. 먼저 환자를 연동해주세요.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <PatientSelector patients={patients} selectedId={selectedId} onSelect={setSelectedId} />

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">가족 구성원</h2>
        {!showForm && selectedId && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:brightness-110"
          >
            + 구성원 추가
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="flex flex-col gap-3 rounded-2xl border border-surface-border bg-surface p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="이름 (예: 김지민)"
              required
              className="rounded-xl border border-surface-border bg-background px-3 py-2 outline-none focus:border-accent"
            />
            <input
              value={relation}
              onChange={(e) => setRelation(e.target.value)}
              placeholder="관계 (예: 손녀)"
              required
              className="rounded-xl border border-surface-border bg-background px-3 py-2 outline-none focus:border-accent"
            />
            <input
              value={birthYear}
              onChange={(e) => setBirthYear(e.target.value)}
              type="number"
              placeholder="출생년도 (선택)"
              className="rounded-xl border border-surface-border bg-background px-3 py-2 outline-none focus:border-accent"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-full border border-surface-border px-5 py-2 text-sm hover:border-accent/50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-foreground hover:brightness-110 disabled:opacity-50"
            >
              {submitting ? "저장 중..." : "저장"}
            </button>
          </div>
        </form>
      )}

      {error && <p className="text-danger-foreground">{error}</p>}
      {loading ? (
        <p className="text-muted-foreground">불러오는 중...</p>
      ) : members.length === 0 ? (
        <p className="text-muted-foreground">등록된 가족 구성원이 없습니다.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {members.map((member) => (
            <FamilyMemberCard key={member.id} member={member} />
          ))}
        </div>
      )}
    </div>
  );
}
