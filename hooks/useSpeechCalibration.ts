"use client";

import { useCallback, useRef } from "react";
import { COMPLETE_SILENCE_MS, DEFAULT_INCOMPLETE_SILENCE_MS } from "@/lib/turnDetector";

const MIN_INCOMPLETE_MS = 2000;
const MAX_INCOMPLETE_MS = 3500;
const HISTORY_SIZE = 8;

export interface UseSpeechCalibrationResult {
  /** 문장이 완결됐을 때 적용할 무음 임계값 (환자마다 크게 다르지 않아 고정값 사용) */
  completeSilenceMs: number;
  /** 지금까지 관찰된 이 환자의 머뭇거림 패턴을 반영한 미완결 무음 임계값 */
  getIncompleteSilenceMs: () => number;
  /** 미완결 판정 후 실제로 환자가 다시 말을 이어간 간격(ms)을 기록해 다음 판단에 반영한다 */
  recordResumeGap: (gapMs: number) => void;
}

/**
 * 세션 동안 환자가 문장 중간에 얼마나 오래 멈췄다가 다시 말을 잇는지 관찰해서
 * 미완결 무음 임계값을 개인화하는 훅.
 */
export function useSpeechCalibration(): UseSpeechCalibrationResult {
  const gapsRef = useRef<number[]>([]);

  const recordResumeGap = useCallback((gapMs: number) => {
    const gaps = gapsRef.current;
    gaps.push(gapMs);
    if (gaps.length > HISTORY_SIZE) gaps.shift();
  }, []);

  const getIncompleteSilenceMs = useCallback(() => {
    const gaps = gapsRef.current;
    if (gaps.length === 0) return DEFAULT_INCOMPLETE_SILENCE_MS;
    const avg = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
    return Math.min(MAX_INCOMPLETE_MS, Math.max(MIN_INCOMPLETE_MS, avg * 1.4));
  }, []);

  return { completeSilenceMs: COMPLETE_SILENCE_MS, getIncompleteSilenceMs, recordResumeGap };
}
