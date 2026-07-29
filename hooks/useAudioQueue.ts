"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface QueueItem {
  blob: Blob;
  /** 이 오디오가 끝까지(중단 없이) 재생을 마쳤을 때만 호출 - barge-in으로 잘리면 호출 안 됨 */
  onDone?: () => void;
}

export interface UseAudioQueueResult {
  isPlaying: boolean;
  /** onDone은 이 오디오가 실제로 끝까지 재생됐을 때만 불린다 (barge-in으로 끊기면 안 불림 -
   *  "어디까지 실제로 말했는지" 추적에 쓴다) */
  enqueue: (blob: Blob, onDone?: () => void) => void;
  /** 현재 재생을 짧은 fade-out과 함께 즉시 멈추고 큐를 비운다 (barge-in용) */
  stop: () => void;
  /** 큐에 남은 오디오를 모두 재생하고 나면 resolve된다 */
  whenIdle: () => Promise<void>;
}

const FADE_MS = 80;
const FADE_STEPS = 4;

export function useAudioQueue(): UseAudioQueueResult {
  const [isPlaying, setIsPlaying] = useState(false);
  const queueRef = useRef<QueueItem[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playingRef = useRef(false);
  const idleWaitersRef = useRef<Array<() => void>>([]);

  const notifyIdle = useCallback(() => {
    idleWaitersRef.current.splice(0).forEach((resolve) => resolve());
  }, []);

  // advance()가 재귀적으로 pump()를 다시 부르므로, 선언 전 참조를 피하려고 ref로 우회한다.
  const pumpRef = useRef<() => void>(() => {});

  const pump = useCallback(() => {
    if (playingRef.current) return;
    const item = queueRef.current.shift();
    if (!item) {
      setIsPlaying(false);
      notifyIdle();
      return;
    }

    playingRef.current = true;
    setIsPlaying(true);
    const url = URL.createObjectURL(item.blob);
    const audio = new Audio(url);
    audioRef.current = audio;

    const advance = (finished: boolean) => {
      URL.revokeObjectURL(url);
      if (audioRef.current === audio) audioRef.current = null;
      playingRef.current = false;
      if (finished) item.onDone?.();
      pumpRef.current();
    };
    audio.onended = () => advance(true);
    audio.onerror = () => advance(false);
    audio.play().catch(() => advance(false));
  }, [notifyIdle]);

  useEffect(() => {
    pumpRef.current = pump;
  }, [pump]);

  const enqueue = useCallback(
    (blob: Blob, onDone?: () => void) => {
      queueRef.current.push({ blob, onDone });
      pump();
    },
    [pump],
  );

  const stop = useCallback(() => {
    queueRef.current = [];
    const audio = audioRef.current;
    if (!audio) {
      setIsPlaying(false);
      notifyIdle();
      return;
    }

    // 급격한 끊김 방지를 위한 짧은 fade-out
    let step = 0;
    const fadeTimer = setInterval(() => {
      step += 1;
      audio.volume = Math.max(0, 1 - step / FADE_STEPS);
      if (step >= FADE_STEPS) {
        clearInterval(fadeTimer);
        audio.pause();
        if (audioRef.current === audio) audioRef.current = null;
        playingRef.current = false;
        setIsPlaying(false);
        notifyIdle();
      }
    }, FADE_MS / FADE_STEPS);
  }, [notifyIdle]);

  const whenIdle = useCallback(() => {
    return new Promise<void>((resolve) => {
      if (!playingRef.current && queueRef.current.length === 0) {
        resolve();
        return;
      }
      idleWaitersRef.current.push(resolve);
    });
  }, []);

  return { isPlaying, enqueue, stop, whenIdle };
}
