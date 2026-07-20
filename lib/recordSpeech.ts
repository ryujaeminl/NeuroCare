'use client';

interface RecordOptions {
  maxDurationMs?: number;
  silenceDurationMs?: number;
  silenceThreshold?: number;
}

export interface RecordResult {
  blob: Blob;
  hadSpeech: boolean;
}

// 마이크를 열어 녹음하다가, 말이 끝나고 일정 시간 동안 조용해지면 자동으로 멈추고 오디오를 반환
// hadSpeech가 false면 실제로 말소리가 감지되지 않은 것 (무음/노이즈만 녹음됨) → Whisper에 넘기면 할루시네이션 유발
export async function recordUntilSilence(options: RecordOptions = {}): Promise<RecordResult> {
  const { maxDurationMs = 12000, silenceDurationMs = 800, silenceThreshold = 0.015 } = options;

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
    },
  });
  const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
  const audioContext = new AudioContextCtor();
  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);

  const dataArray = new Uint8Array(analyser.fftSize);
  const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
    .find((t) => MediaRecorder.isTypeSupported(t));
  const recorder = new MediaRecorder(stream, {
    ...(mimeType ? { mimeType } : {}),
    audioBitsPerSecond: 128000,
  });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  return new Promise<RecordResult>((resolve, reject) => {
    let hasSpoken = false;
    let silenceStart: number | null = null;
    let stopped = false;
    let rafId = 0;

    const cleanup = () => {
      cancelAnimationFrame(rafId);
      clearTimeout(maxTimer);
      stream.getTracks().forEach((t) => t.stop());
      audioContext.close().catch(() => {});
    };

    recorder.onstop = () => {
      cleanup();
      resolve({
        blob: new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }),
        hadSpeech: hasSpoken,
      });
    };
    recorder.onerror = (event) => {
      cleanup();
      reject(event);
    };

    const stopRecording = () => {
      if (stopped) return;
      stopped = true;
      recorder.stop();
    };

    const tick = () => {
      if (stopped) return;
      analyser.getByteTimeDomainData(dataArray);

      let sumSquares = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const normalized = (dataArray[i] - 128) / 128;
        sumSquares += normalized * normalized;
      }
      const rms = Math.sqrt(sumSquares / dataArray.length);
      const now = performance.now();

      if (rms > silenceThreshold) {
        hasSpoken = true;
        silenceStart = null;
      } else if (hasSpoken) {
        if (silenceStart === null) silenceStart = now;
        if (now - silenceStart > silenceDurationMs) {
          stopRecording();
          return;
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    recorder.start();
    rafId = requestAnimationFrame(tick);
    const maxTimer = setTimeout(stopRecording, maxDurationMs);
  });
}
