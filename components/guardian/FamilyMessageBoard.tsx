"use client";

import { useEffect, useState } from "react";
import type { FamilyMessage } from "@prisma/client";

/** 가족이 환자에게 남기는 짧은 메시지. AI가 대화 중 먼저 "메시지가 있어요, 읽어드릴까요?"라고
 * 물어보고 전달한다(app/api/chat/route.ts) - 여기서는 남기기/목록/삭제만 다룬다. */
export function FamilyMessageBoard({ patientId }: { patientId: string }) {
  const [messages, setMessages] = useState<FamilyMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromName, setFromName] = useState("");
  const [content, setContent] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const url = patientId ? `/api/guardian/messages?patientId=${patientId}` : "/api/guardian/messages";
        const response = await fetch(url);
        const data = await response.json();
        if (!cancelled) {
          setMessages(data.messages ?? []);
          setError(null);
        }
      } catch {
        if (!cancelled) setMessages([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("patientId", patientId);
      form.append("fromName", fromName);
      form.append("content", content);
      if (photo) form.append("file", photo);

      const response = await fetch("/api/guardian/messages", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "등록에 실패했습니다.");
        return;
      }
      setMessages((prev) => [data.message, ...prev]);
      setFromName("");
      setContent("");
      setPhoto(null);
    } catch {
      setError("등록에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    setMessages((prev) => prev.filter((m) => m.id !== id));
    await fetch(`/api/guardian/messages/${id}`, { method: "DELETE" }).catch(() => {});
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-surface-border bg-surface p-5">
      <h3 className="font-semibold">가족 메시지</h3>
      <p className="text-sm text-muted-foreground">
        여기 남긴 메시지는 대화 중 AI가 먼저 &ldquo;OO님이 메시지를 남기셨어요, 읽어드릴까요?&rdquo;라고
        물어본 뒤 원하실 때만 전달합니다.
      </p>

      <form onSubmit={handleAdd} className="flex flex-col gap-2">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={fromName}
            onChange={(e) => setFromName(e.target.value)}
            placeholder="보낸 사람 (예: 손녀 지민)"
            required
            className="rounded-xl border border-surface-border bg-background px-3 py-2 text-sm outline-none focus:border-accent sm:w-40"
          />
          <input
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="메시지 내용"
            required
            className="flex-1 rounded-xl border border-surface-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            className="flex-1 text-sm text-muted-foreground file:mr-3 file:rounded-full file:border-0 file:bg-background file:px-3 file:py-1.5 file:text-sm file:text-foreground"
          />
          <button
            type="submit"
            disabled={submitting}
            className="shrink-0 rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:brightness-110 disabled:opacity-50"
          >
            남기기
          </button>
        </div>
        {photo && <p className="text-xs text-muted-foreground">사진 첨부됨: {photo.name}</p>}
      </form>

      {error && <p className="text-sm text-danger-foreground">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted-foreground">불러오는 중...</p>
      ) : messages.length === 0 ? (
        <p className="text-sm text-muted-foreground">남긴 메시지가 없습니다.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {messages.map((message) => (
            <li
              key={message.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-surface-border bg-background px-3 py-2 text-sm"
            >
              <div>
                <p>
                  <span className="font-medium">{message.fromName}</span>: {message.content}
                </p>
                {message.photoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={message.photoUrl} alt="" className="mt-2 h-24 w-24 rounded-lg object-cover" />
                )}
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {new Date(message.createdAt).toLocaleString("ko-KR")} ·{" "}
                  {message.deliveredAt ? "전달됨" : "아직 전달 전"}
                  {message.photoUrl && (message.photoShownAt ? " · 사진 보여드림" : " · 사진 아직 안 보여줌")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(message.id)}
                className="shrink-0 text-xs text-muted-foreground hover:text-danger-foreground"
              >
                삭제
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
