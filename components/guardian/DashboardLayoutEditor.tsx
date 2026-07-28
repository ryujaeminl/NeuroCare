"use client";

import { useState } from "react";
import type { WidgetId } from "@/lib/db/types";

const WIDGET_LABELS: Record<WidgetId, string> = {
  mood: "오늘의 기분",
  medication: "복용약 현황",
  family: "가족 구성원",
};

interface DashboardLayoutEditorProps {
  order: WidgetId[];
  onChange: (order: WidgetId[]) => void;
}

/** 대시보드 위젯 순서를 끌어다 놓아 바꾼다. 네이티브 HTML5 드래그 이벤트만 쓴다. */
export function DashboardLayoutEditor({ order, onChange }: DashboardLayoutEditorProps) {
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  function handleDrop(targetIndex: number) {
    if (draggingIndex === null || draggingIndex === targetIndex) return;
    const next = [...order];
    const [moved] = next.splice(draggingIndex, 1);
    next.splice(targetIndex, 0, moved);
    onChange(next);
    setDraggingIndex(null);
  }

  return (
    <ul className="flex flex-col gap-2">
      {order.map((id, index) => (
        <li
          key={id}
          draggable
          onDragStart={() => setDraggingIndex(index)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => handleDrop(index)}
          className={`flex cursor-grab items-center gap-3 rounded-xl border px-4 py-3 active:cursor-grabbing ${
            draggingIndex === index ? "border-accent bg-accent/10" : "border-surface-border bg-background"
          }`}
        >
          <span className="text-muted-foreground">⠿</span>
          <span>{WIDGET_LABELS[id]}</span>
        </li>
      ))}
    </ul>
  );
}
