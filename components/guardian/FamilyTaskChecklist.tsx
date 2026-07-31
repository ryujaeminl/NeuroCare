"use client";

import { useEffect, useState } from "react";
import type { FamilyTask } from "@prisma/client";

/** 보호자끼리 조율하는 할 일 목록 - 환자 대화와는 무관하고 여기(보호자 화면)에서만 보인다. */
export function FamilyTaskChecklist({ patientId }: { patientId: string }) {
  const [tasks, setTasks] = useState<FamilyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const response = await fetch(`/api/guardian/tasks?patientId=${patientId}`);
        const data = await response.json();
        if (!cancelled) setTasks(data.tasks ?? []);
      } catch {
        if (!cancelled) setError("할 일을 불러오지 못했습니다.");
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
      const response = await fetch("/api/guardian/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, title, dueDate: dueDate || null }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "등록에 실패했습니다.");
        return;
      }
      setTasks((prev) => [data.task, ...prev]);
      setTitle("");
      setDueDate("");
    } catch {
      setError("등록에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleCompleted(task: FamilyTask) {
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, completed: !t.completed } : t)));
    await fetch(`/api/guardian/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: !task.completed }),
    }).catch(() => {});
  }

  async function handleDelete(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    await fetch(`/api/guardian/tasks/${id}`, { method: "DELETE" }).catch(() => {});
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-surface-border bg-surface p-5">
      <h3 className="font-semibold">보호자 할 일</h3>
      <p className="text-sm text-muted-foreground">
        보호자끼리 나눠서 챙길 일을 정리해두는 목록입니다. 환자와의 대화에는 쓰이지 않습니다.
      </p>

      <form onSubmit={handleAdd} className="flex flex-col gap-2 sm:flex-row">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="할 일 (예: 이번 주 장보기)"
          required
          className="flex-1 rounded-xl border border-surface-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="rounded-xl border border-surface-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:brightness-110 disabled:opacity-50"
        >
          추가
        </button>
      </form>

      {error && <p className="text-sm text-danger-foreground">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted-foreground">불러오는 중...</p>
      ) : tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">등록된 할 일이 없습니다.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-surface-border bg-background px-3 py-2 text-sm"
            >
              <label className="flex flex-1 items-center gap-2">
                <input
                  type="checkbox"
                  checked={task.completed}
                  onChange={() => toggleCompleted(task)}
                  className="h-4 w-4 accent-accent"
                />
                <span className={task.completed ? "text-muted-foreground line-through" : ""}>{task.title}</span>
                {task.dueDate && (
                  <span className="text-xs text-muted-foreground">~{new Date(task.dueDate).toLocaleDateString("ko-KR")}</span>
                )}
              </label>
              <button
                type="button"
                onClick={() => handleDelete(task.id)}
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
