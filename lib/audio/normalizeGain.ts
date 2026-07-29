/**
 * 오디오 피크를 목표 수준까지 끌어올려 whisper가 더 정확히 들을 수 있게 한다.
 * 네이티브 웨이크워드 경로(AudioCapture)에는 이미 있던 처리인데, 웹 대화 경로는
 * 원음을 그대로 보내고 있었다 - 조용히/평소 톤으로 말할 때 인식이 부정확했던
 * 원인 중 하나. 잡음까지 과도하게 증폭되지 않도록 게인에 상한을 둔다.
 */
export function normalizeGain(samples: Float32Array): Float32Array {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > peak) peak = abs;
  }
  if (peak <= 0) return samples;

  const gain = Math.min(0.9 / peak, 20);
  const boosted = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    boosted[i] = Math.max(-1, Math.min(1, samples[i] * gain));
  }
  return boosted;
}
