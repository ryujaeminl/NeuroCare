"use client";

import { useRef, useState } from "react";

export interface UploadedPhoto {
  id: string;
  url: string;
  caption: string | null;
  familyMemberId: string | null;
  familyMember: { id: string; name: string } | null;
}

interface FamilyMemberOption {
  id: string;
  name: string;
}

interface PhotoUploaderProps {
  patientId: string;
  familyMembers: FamilyMemberOption[];
  onUploaded: (photo: UploadedPhoto) => void;
}

/** 드래그 앤 드롭 또는 파일 선택으로 사진을 올린다. 업로드 시 인물 태깅은 선택 사항이다. */
export function PhotoUploader({ patientId, familyMembers, onUploaded }: PhotoUploaderProps) {
  const [familyMemberId, setFamilyMemberId] = useState("");
  const [caption, setCaption] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("patientId", patientId);
      if (familyMemberId) form.append("familyMemberId", familyMemberId);
      if (caption) form.append("caption", caption);

      const response = await fetch("/api/guardian/photos", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "업로드에 실패했습니다.");
        return;
      }
      onUploaded(data.photo);
      setCaption("");
    } catch {
      setError("업로드에 실패했습니다.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-surface-border bg-surface p-5">
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
          설명 (선택)
          <input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="손녀 돌잔치"
            className="rounded-xl border border-surface-border bg-background px-3 py-2 outline-none focus:border-accent"
          />
        </label>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) void upload(file);
        }}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition ${
          dragging ? "border-accent bg-accent/10" : "border-surface-border hover:border-accent/50"
        }`}
      >
        <span className="text-2xl">📷</span>
        <p className="text-sm text-muted-foreground">
          {uploading ? "업로드 중..." : "클릭하거나 사진을 여기로 끌어다 놓으세요"}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = "";
          }}
        />
      </div>

      {error && <p className="text-sm text-danger-foreground">{error}</p>}
    </div>
  );
}
