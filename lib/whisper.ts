'use client';

// 실제 Whisper 추론은 서버(app/api/transcribe)에서 onnxruntime-node로 처리 —
// 브라우저 WASM보다 훨씬 빠르고, 더 정확한 모델을 써도 클라이언트가 느려지지 않음.
// 여기서는 녹음된 오디오를 16kHz 모노 PCM으로 디코딩해서 서버로 올리는 역할만 함.

// Assistant 화면 진입 시 서버 쪽 모델을 미리 로드해두기 위한 워밍업 핑 (실패해도 무시)
export function preloadWhisper() {
  fetch('/api/transcribe').catch(() => {});
}

function toMonoFloat32(audioBuffer: AudioBuffer): Float32Array {
  if (audioBuffer.numberOfChannels === 1) {
    return audioBuffer.getChannelData(0);
  }
  // 스테레오인 경우 채널을 평균 내서 모노로 변환 (한쪽 채널만 쓰는 것보다 정확)
  const length = audioBuffer.length;
  const mixed = new Float32Array(length);
  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    const channel = audioBuffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      mixed[i] += channel[i] / audioBuffer.numberOfChannels;
    }
  }
  return mixed;
}

export async function transcribeAudio(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
  const audioContext = new AudioContextCtor({ sampleRate: 16000 });

  let channelData: Float32Array;
  try {
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    channelData = toMonoFloat32(audioBuffer);
  } finally {
    await audioContext.close();
  }

  const response = await fetch('/api/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: channelData.buffer as ArrayBuffer,
  });

  if (!response.ok) {
    throw new Error('음성 인식 서버 오류');
  }

  const data = await response.json();
  return (data.text || '').trim();
}
