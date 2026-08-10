"use client";

import { useEffect, useRef } from "react";

export interface UseBargeInOptions {
  /** VAD가 지금 이 순간 사용자가 말하고 있다고 판단하는지 */
  userSpeaking: boolean;
  /** AI가 응답을 생성 중인지(아직 소리는 안 나가는 상태) */
  thinking: boolean;
  /** AI가 실제로 TTS 오디오를 재생 중인지(스피커로 소리가 나가는 상태) */
  speaking: boolean;
  onBargeIn: () => void;
}

/** vad-web의 minSpeechMs(hooks/useVAD.ts)와 맞춘 값 - 짧은 잡음(문 닫는 소리, TV 블립 등)이
 * VAD 임계값을 잠깐 넘겨도 vad-web 스스로 onVADMisfire로 무효 처리하는 기준과 같은 길이만큼
 * 기다렸다가 그때까지도 계속 말하는 중이면 그제서야 진짜 끼어들기로 인정한다.
 * thinking 중엔 스피커가 조용하므로(에코 발생 불가) 이 짧은 확인만으로 충분하다. */
const THINKING_CONFIRM_MS = 250;

/** speaking(TTS 재생) 중에만 적용하는 더 긴 확인 시간. 브라우저 echoCancellation이 스피커로
 * 나가는 AI 목소리를 어느 정도 걸러주지만, 헤드폰 없이 태블릿 내장 스피커+마이크처럼 둘이
 * 가까운 기기에서는 완벽하지 않아 짧게 새어나온 에코가 VAD 임계값을 잠깐씩 넘긴다. 진짜
 * 끼어들기(사람이 실제로 말을 얹는 것)는 이보다 훨씬 길게 이어지므로, 재생 중에만 확인
 * 시간을 늘려 에코 오탐은 걸러내고 진짜 끼어들기는 그대로 통과시킨다. 시작값이라 실제
 * 기기에서 "말이 안 끊긴다"/"여전히 자주 끊긴다" 피드백을 보며 조정한다. */
const SPEAKING_CONFIRM_MS = 600;

/**
 * AI가 생각 중이거나 말하는 도중 사용자가 다시 말을 시작하면 onBargeIn을 호출한다.
 * 실제 오디오 정지/요청 취소는 호출부(onBargeIn)에서 처리한다 - 이 훅은 트리거 감지만 담당한다.
 *
 * onSpeechStart 즉시 반응하지 않는 이유: vad-web은 소리가 나는 순간 바로 userSpeaking을
 * true로 올리고, "정말 말이었는지"는 나중에(끝났을 때 minSpeechMs 못 채우면 misfire로)
 * 판정한다. 그 판정이 나오기 전에 곧바로 TTS를 끊어버리면, 결국 잡음으로 판명 나는
 * 소리에도 매번 AI 말이 잘렸다("가끔 잡음이 들려도 tts 출력 멈춤" 실사용 보고) - thinking
 * 중엔 vad-web 자신의 misfire 기준과 같은 시간만큼만, speaking 중엔 에코까지 걸러낼 만큼
 * 더 오래 기다렸다가, 그래도 여전히 말하는 중이면 그때 끼어들기로 확정한다.
 */
export function useBargeIn({ userSpeaking, thinking, speaking, onBargeIn }: UseBargeInOptions) {
  const onBargeInRef = useRef(onBargeIn);
  useEffect(() => {
    onBargeInRef.current = onBargeIn;
  }, [onBargeIn]);

  useEffect(() => {
    if (!userSpeaking || (!thinking && !speaking)) return;
    const confirmMs = speaking ? SPEAKING_CONFIRM_MS : THINKING_CONFIRM_MS;
    const timer = setTimeout(() => {
      onBargeInRef.current();
    }, confirmMs);
    // userSpeaking이 확인 시간 안에 다시 false로 돌아오면(=misfire였다는 뜻) 이 effect가
    // 재실행되면서 클린업이 먼저 불려 타이머가 취소된다 - 끼어들기가 발동하지 않는다.
    return () => clearTimeout(timer);
  }, [userSpeaking, thinking, speaking]);
}
