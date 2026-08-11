"use client";

import { useEffect, useState } from "react";

type FontScale = "base" | "lg" | "xl";

const STORAGE_KEY = "guardianFontScale";
const OPTIONS: { value: FontScale; label: string }[] = [
  { value: "base", label: "가" },
  { value: "lg", label: "가+" },
  { value: "xl", label: "가++" },
];

function applyScale(scale: FontScale) {
  if (scale === "base") {
    document.documentElement.removeAttribute("data-font-scale");
  } else {
    document.documentElement.setAttribute("data-font-scale", scale);
  }
}

/** 고령 가족 구성원도 보는 화면이라 글씨 크기를 즉시 조절할 수 있게 한다. 선택값은 브라우저에 저장. */
export function FontSizeToggle() {
  const [scale, setScale] = useState<FontScale>("base");

  useEffect(() => {
    // 서버 렌더는 저장된 값을 알 수 없어 항상 "base"로 시작한다 - 마운트 후 localStorage를 읽어
    // 한 번 더 렌더링해 실제 저장값을 반영한다(하이드레이션 불일치를 피하기 위한 의도된 재렌더).
    const stored = window.localStorage.getItem(STORAGE_KEY) as FontScale | null;
    if (stored === "base" || stored === "lg" || stored === "xl") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setScale(stored);
      applyScale(stored);
    }
  }, []);

  function handleSelect(next: FontScale) {
    setScale(next);
    applyScale(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }

  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-surface-border bg-surface p-0.5" role="group" aria-label="글씨 크기 조절">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => handleSelect(option.value)}
          aria-pressed={scale === option.value}
          className={`rounded-md px-2 py-1 text-xs font-semibold transition ${
            scale === option.value ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-background"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
