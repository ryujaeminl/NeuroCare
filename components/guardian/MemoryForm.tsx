"use client";

import { useState } from "react";

export interface MemoryFormValue {
  id: string;
  patientId: string;
  familyMemberId: string | null;
  title: string;
  content: string;
  dateOccurred: string | Date | null;
  tags: string[];
}

interface FamilyMemberOption {
  id: string;
  name: string;
}

interface MemoryFormProps {
  patientId: string;
  familyMembers: FamilyMemberOption[];
  defaultFamilyMemberId?: string;
  initial?: MemoryFormValue;
  onSaved: (memory: MemoryFormValue) => void;
  onCancel: () => void;
}

function toDateInput(value: string | Date | null | undefined) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

/** 기억 추가/수정 폼. 보호자가 짧게만 써도 되도록 placeholder에 실제 예시를 넣는다. */
export function MemoryForm({
  patientId,
  familyMembers,
  defaultFamilyMemberId,
  initial,
  onSaved,
  onCancel,
}: MemoryFormProps) {
  const [familyMemberId, setFamilyMemberId] = useState(initial?.familyMemberId ?? defaultFamilyMemberId ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [dateOccurred, setDateOccurred] = useState(toDateInput(initial?.dateOccurred));
  const [tags, setTags] = useState(initial?.tags.join(", ") ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const url = initial ? `/api/guardian/memories/${initial.id}` : "/api/guardian/memories";
      const response = await fetch(url, {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          familyMemberId: familyMemberId || null,
          title,
          content,
          dateOccurred: dateOccurred || null,
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "저장에 실패했습니다.");
        return;
      }
      onSaved(data.memory);
    } catch {
      setError("저장에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-2xl border border-surface-border bg-surface p-5">
      <label className="flex flex-col gap-1 text-sm">
        제목
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="손녀 돌잔치"
          required
          className="rounded-xl border border-surface-border bg-background px-3 py-2 outline-none focus:border-accent"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        내용
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="2010년경 첫째 아들 결혼식, 제주도에서 진행"
          rows={3}
          required
          className="rounded-xl border border-surface-border bg-background px-3 py-2 outline-none focus:border-accent"
        />
      </label>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          관련 인물 (선택)
          <select
            value={familyMemberId}
            onChange={(e) => setFamilyMemberId(e.target.value)}
            className="rounded-xl border border-surface-border bg-background px-3 py-2 outline-none focus:border-accent"
          >
            <option value="">선택 안 함</option>
            {familyMembers.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          시기 (선택, 모르면 비워두세요)
          <input
            type="date"
            value={dateOccurred}
            onChange={(e) => setDateOccurred(e.target.value)}
            className="rounded-xl border border-surface-border bg-background px-3 py-2 outline-none focus:border-accent"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        태그 (쉼표로 구분, 선택)
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="결혼식, 제주도"
          className="rounded-xl border border-surface-border bg-background px-3 py-2 outline-none focus:border-accent"
        />
      </label>

      {error && <p className="text-sm text-danger-foreground">{error}</p>}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
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
  );
}
