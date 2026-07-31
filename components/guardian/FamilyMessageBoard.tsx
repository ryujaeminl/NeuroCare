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
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const response = await fetch(`/api/guardian/messages?patientId=${patientId}`);
        const data = await response.json();
        if (!cancelled) setMessages(data.messages ?? []);
      } catch {
        if (!cancelled) setError("메시지를 불러오지 못했습니다.");
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
      const response = await fetch("/api/guardian/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, fromName, content }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "등록에 실패했습니다.");
        return;
      }
      setMessages((prev) => [data.message, ...prev]);
      setFromName("");
      setContent("");
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
    <section className="flex flex-col gap-3 rounded-2xl border border-surface-border bg-surface p-5">
      <h3 className="font-semibold">가족 메시지</h3>
      <p className="text-sm text-muted-foreground">
        여기 남긴 메시지는 대화 중 AI가 먼저 &ldquo;OO님이 메시지를 남기셨어요, 읽어드릴까요?&rdquo;라고
        물어본 뒤 원하실 때만 전달합니다.
      </p>

      <form onSubmit={handleAdd} className="flex flex-col gap-2 sm:flex-row">
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
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:brightness-110 disabled:opacity-50"
        >
          남기기
        </button>
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
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {new Date(message.createdAt).toLocaleString("ko-KR")} ·{" "}
                  {message.deliveredAt ? "전달됨" : "아직 전달 전"}
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
