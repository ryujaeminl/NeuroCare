"use client";

import { useEffect, useRef } from "react";

export interface UseBargeInOptions {
  /** VAD가 지금 이 순간 사용자가 말하고 있다고 판단하는지 */
  userSpeaking: boolean;
  /** AI가 응답을 생성 중이거나(생각 중) 말하는 중인지 - 이 동안의 발화만 끼어들기로 간주한다 */
  assistantBusy: boolean;
  onBargeIn: () => void;
}

/**
 * AI가 생각 중이거나 말하는 도중 사용자가 다시 말을 시작하면 onBargeIn을 호출한다.
 * 실제 오디오 정지/요청 취소는 호출부(onBargeIn)에서 처리한다 - 이 훅은 트리거 감지만 담당한다.
 *
 * 주의: 진짜 끼어들기를 지원하려면 AI가 말하는 동안에도 VAD(마이크)가 계속 켜져 있어야 한다.
 * 브라우저의 기본 echoCancellation이 스피커로 나가는 AI 목소리를 어느 정도 걸러주지만
 * 완벽하지 않으므로, 헤드폰 사용 시 가장 안정적으로 동작한다.
 */
export function useBargeIn({ userSpeaking, assistantBusy, onBargeIn }: UseBargeInOptions) {
  const onBargeInRef = useRef(onBargeIn);
  useEffect(() => {
    onBargeInRef.current = onBargeIn;
  }, [onBargeIn]);

  useEffect(() => {
    if (userSpeaking && assistantBusy) {
      onBargeInRef.current();
    }
  }, [userSpeaking, assistantBusy]);
}
