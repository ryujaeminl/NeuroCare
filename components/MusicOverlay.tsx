"use client";

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
      <iframe
        key={state.videoId}
        src={`https://www.youtube.com/embed/${state.videoId}?autoplay=1`}
        className="aspect-video w-full"
        allow="autoplay; encrypted-media"
        title={state.title}
      />
    </div>
  );
}
