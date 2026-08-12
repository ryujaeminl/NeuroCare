"use client";

import { useState } from "react";

export interface MusicOverlayState {
  videoId: string;
  title: string;
}

/** 대화 화면 위에 겹쳐서 재생 중인 유튜브 영상을 보여준다. 재생목록/큐 없이
 * 한 번에 한 곡만 - X 버튼이 마이크 오인식 시 최종 안전장치 역할도 한다. */
export function MusicOverlay({ state, onClose }: { state: MusicOverlayState; onClose: () => void }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 w-72 overflow-hidden rounded-xl border border-surface-border bg-surface shadow-lg">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <p className="truncate text-sm font-medium">{state.title}</p>
        <button
          onClick={onClose}
          aria-label="음악 닫기"
          className="shrink-0 flex h-6 w-6 items-center justify-center rounded-full bg-background text-xs"
        >
          ✕
        </button>
      </div>
      <VideoContent key={state.videoId} videoId={state.videoId} title={state.title} />
    </div>
  );
}

function VideoContent({ videoId, title }: { videoId: string; title: string }) {
  const [hasError, setHasError] = useState(false);

  return (
    <div>
      {hasError ? (
        <div className="aspect-video w-full flex items-center justify-center">
          <p className="text-sm">영상을 불러올 수 없어요.</p>
        </div>
      ) : (
        <iframe
          src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
          className="aspect-video w-full"
          allow="autoplay; encrypted-media"
          title={title}
          onError={() => setHasError(true)}
        />
      )}
    </div>
  );
}
