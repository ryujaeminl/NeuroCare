"use client";

import { useEffect, useRef, useState } from "react";

export interface MusicOverlayState {
  /** 검색어 그대로 - 서버에서 특정 영상을 미리 찾지 않는다. YouTube IFrame
   * Player의 검색모드(listType: "search")가 첫 검색 결과를 바로 재생한다. */
  query: string;
  title: string;
}

interface YTPlayer {
  setVolume: (volume: number) => void;
  destroy: () => void;
}

interface YTPlayerOptions {
  playerVars?: Record<string, number | string>;
  events?: {
    onReady?: (event: { target: YTPlayer }) => void;
    onError?: () => void;
  };
}

declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, opts: YTPlayerOptions) => YTPlayer };
    onYouTubeIframeAPIReady?: () => void;
  }
}

// 여러 오버레이 마운트(곡 바뀔 때마다 VideoContent가 리마운트됨)가 같은 로드를
// 공유하도록 모듈 스코프에 캐시한다 - 스크립트 태그를 곡마다 중복 삽입하지 않기 위함.
let apiLoadPromise: Promise<void> | null = null;
function loadYouTubeIframeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  apiLoadPromise ??= new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(script);
  });
  return apiLoadPromise;
}

const FADE_IN_MS = 1500;
const FADE_STEP_MS = 100;

/** 갑자기 큰 소리로 시작하지 않도록 재생 시작 후 볼륨을 0에서 100까지 서서히 올린다
 * (치매 환자 대상 앱이라 감각 자극 최소화). */
function fadeInVolume(player: YTPlayer) {
  const steps = FADE_IN_MS / FADE_STEP_MS;
  let step = 0;
  player.setVolume(0);
  const interval = setInterval(() => {
    step += 1;
    player.setVolume(Math.min(100, Math.round((step / steps) * 100)));
    if (step >= steps) clearInterval(interval);
  }, FADE_STEP_MS);
  return () => clearInterval(interval);
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
      <VideoContent key={state.query} query={state.query} title={state.title} />
    </div>
  );
}

function VideoContent({ query, title }: { query: string; title: string }) {
  const [hasError, setHasError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const fadeCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadYouTubeIframeApi().then(() => {
      if (cancelled || !containerRef.current || !window.YT) return;
      playerRef.current = new window.YT.Player(containerRef.current, {
        // 특정 영상을 미리 찾지 않고, 유튜브 검색모드로 첫 검색 결과를 바로 재생한다
        // (서버 검색 왕복이 없어져 재생 시작이 훨씬 빠르고, yt-search 스크레이핑에
        // 기대지 않는다).
        playerVars: { listType: "search", list: query, autoplay: 1, playsinline: 1 },
        events: {
          onReady: (event) => {
            fadeCleanupRef.current?.();
            fadeCleanupRef.current = fadeInVolume(event.target);
          },
          onError: () => {
            fadeCleanupRef.current?.();
            fadeCleanupRef.current = null;
            playerRef.current?.destroy();
            playerRef.current = null;
            setHasError(true);
          },
        },
      });
    });
    return () => {
      cancelled = true;
      fadeCleanupRef.current?.();
      fadeCleanupRef.current = null;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [query]);

  return (
    <div>
      {hasError ? (
        <div className="aspect-video w-full flex items-center justify-center">
          <p className="text-sm">영상을 불러올 수 없어요.</p>
        </div>
      ) : (
        <div ref={containerRef} className="aspect-video w-full" aria-label={title} />
      )}
    </div>
  );
}
