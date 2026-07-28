/**
 * 브라우저 내장 SpeechSynthesis로 문장을 순서대로 읽어주는 큐.
 * edge-tts(6단계)가 붙기 전까지의 임시 TTS이자, 원래 스펙의 "이중 안전장치" 폴백이기도 하다.
 */
class SpeechQueue {
  private queue: string[] = [];
  private speaking = false;
  private idleWaiters: Array<() => void> = [];

  enqueue(text: string) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    this.queue.push(text);
    this.pump();
  }

  private pump() {
    if (this.speaking) return;
    const text = this.queue.shift();
    if (text === undefined) {
      this.idleWaiters.splice(0).forEach((resolve) => resolve());
      return;
    }

    this.speaking = true;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ko-KR";
    // 환자의 인지 처리 시간을 고려해 기본보다 살짝 느리게
    utterance.rate = 0.95;
    const advance = () => {
      this.speaking = false;
      this.pump();
    };
    utterance.onend = advance;
    utterance.onerror = advance;
    window.speechSynthesis.speak(utterance);
  }

  /** 큐에 남은 문장을 모두 읽고 나면 resolve된다 */
  whenIdle(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.speaking && this.queue.length === 0) {
        resolve();
        return;
      }
      this.idleWaiters.push(resolve);
    });
  }

  stop() {
    this.queue = [];
    this.speaking = false;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    this.idleWaiters.splice(0).forEach((resolve) => resolve());
  }
}

export const speechQueue = new SpeechQueue();
