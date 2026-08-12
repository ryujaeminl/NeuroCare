"use client";

import { useEffect, useRef, useState } from "react";

export interface MusicOverlayState {
  videoId: string;
  title: string;
}

interface YTPlayer {
  setVolume: (volume: number) => void;
  destroy: () => void;
}

interface YTPlayerErrorEvent {
  target: YTPlayer;
  /** YouTube IFrame API 에러 코드: 2=잘못된 파라미터, 5=HTML5 플레이어 오류,
   * 100=삭제/비공개 영상, 101/150=업로더가 임베드 재생을 막아둔 영상. */
  data: number;
}

interface YTPlayerOptions {
  videoId: string;
  playerVars?: Record<string, number>;
  events?: {
    onReady?: (event: { target: YTPlayer }) => void;
    onError?: (event: YTPlayerErrorEvent) => void;
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

/** 기기에서만 보이는 임베드 실패를 서버 로그로 올린다 - components/ClientDiagnostics.tsx와
 * 같은 패턴/엔드포인트. 이전에 여러 차례 "재생이 안 된다"는 보고를 받았지만 임베드가
 * 정확히 왜 실패하는지(에러 코드) 실제로 본 적이 없어서 원인을 못 좁혔다. */
function reportPlaybackIssue(message: string) {
  void fetch("/api/client-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  }).catch(() => undefined);
}

function openInYoutubeApp(query: string) {
  if (window.Android?.openYoutubeSearch) {
    window.Android.openYoutubeSearch(query);
  } else {
    window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, "_blank");
  }
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
      <VideoContent key={state.videoId} videoId={state.videoId} title={state.title} />
    </div>
  );
}

function VideoContent({ videoId, title }: { videoId: string; title: string }) {
  const [hasError, setHasError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const fadeCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    reportPlaybackIssue(`음악 임베드 시도: videoId=${videoId} title=${title.slice(0, 80)}`);
    void loadYouTubeIframeApi().then(() => {
      if (cancelled || !containerRef.current || !window.YT) return;
      playerRef.current = new window.YT.Player(containerRef.current, {
        videoId,
        playerVars: { autoplay: 1, playsinline: 1 },
        events: {
          onReady: (event) => {
            fadeCleanupRef.current?.();
            fadeCleanupRef.current = fadeInVolume(event.target);
          },
          onError: (event) => {
            reportPlaybackIssue(
              `음악 임베드 실패: videoId=${videoId} title=${title.slice(0, 80)} errorCode=${event.data}`,
            );
            fadeCleanupRef.current?.();
            fadeCleanupRef.current = null;
            playerRef.current?.destroy();
            playerRef.current = null;
            setHasError(true);
            // 이 영상 자체가 임베드로 못 트는 경우(업로더가 막아둠 등)가 흔하다 -
            // 진단은 위에서 서버로 이미 올렸으니, 환자에게는 유튜브에서 바로 열어 준다.
            openInYoutubeApp(title);
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
  }, [videoId, title]);

  return (
    <div>
      {hasError ? (
        <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 p-3 text-center">
          <p className="text-sm">여기서는 재생할 수 없어 유튜브에서 열었어요.</p>
          <button
            onClick={() => openInYoutubeApp(title)}
            className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground"
          >
            다시 유튜브에서 열기
          </button>
        </div>
      ) : (
        <div ref={containerRef} className="aspect-video w-full" aria-label={title} />
      )}
    </div>
  );
}
