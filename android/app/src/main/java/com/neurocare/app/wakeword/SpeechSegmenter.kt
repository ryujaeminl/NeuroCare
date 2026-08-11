package com.neurocare.app.wakeword

/**
 * 프레임 단위 VAD 확률을 발화 구간(세그먼트)으로 묶는 상태머신.
 * 웹의 vad-web `frame-processor.ts`와 같은 파라미터(threshold/redemption/preSpeechPad/
 * minSpeech)를 그대로 옮겨서, 웹에서 튜닝해 검증한 동작을 그대로 재현한다.
 *
 * hooks/useVAD.ts와 값을 맞춘다 - 웹 쪽은 실사용 로그에서 "야"/"너" 같은 한 음절 호출이
 * "너무 짧은 발화"로 계속 무시되는 게 확인돼 minSpeechMs를 400→250→150으로,
 * redemptionMs를 1400→600→400→300으로 여러 차례 낮췄는데(hooks/useVAD.ts 주석 참고),
 * 이 클래스의 기본값은 그 튜닝 이전 초기값 그대로 남아있어 네이티브 웨이크워드 경로에서만
 * 짧은 단어가 계속 씹히고 있었다.
 */
class SpeechSegmenter(
    private val vad: SileroVad,
    private val positiveSpeechThreshold: Float = 0.8f,
    private val negativeSpeechThreshold: Float = 0.65f,
    redemptionMs: Int = 300,
    preSpeechPadMs: Int = 800,
    minSpeechMs: Int = 150,
    private val onSpeechSegment: (FloatArray) -> Unit,
) {
    private val msPerFrame = AudioCapture.FRAME_SAMPLES * 1000 / AudioCapture.SAMPLE_RATE
    private val redemptionFrames = redemptionMs / msPerFrame
    private val preSpeechPadFrames = preSpeechPadMs / msPerFrame
    private val minSpeechFrames = minSpeechMs / msPerFrame

    private val audioBuffer = ArrayDeque<FloatArray>()
    private var speechFrameCount = 0
    private var redemptionCounter = 0
    private var active = false

    fun processFrame(frame: FloatArray) {
        val prob = vad.process(frame)
        val isSpeech = prob >= positiveSpeechThreshold

        audioBuffer.addLast(frame)

        if (isSpeech) {
            speechFrameCount++
            redemptionCounter = 0
            active = true
        }

        if (!active) {
            while (audioBuffer.size > preSpeechPadFrames) audioBuffer.removeFirst()
            return
        }

        if (prob < negativeSpeechThreshold) {
            redemptionCounter++
            if (redemptionCounter >= redemptionFrames) {
                finalizeSegment()
            }
        } else {
            redemptionCounter = 0
        }
    }

    private fun finalizeSegment() {
        val frames = audioBuffer.toList()
        audioBuffer.clear()
        active = false
        redemptionCounter = 0
        val countedSpeechFrames = speechFrameCount
        speechFrameCount = 0

        if (countedSpeechFrames < minSpeechFrames) return

        val merged = FloatArray(frames.sumOf { it.size })
        var offset = 0
        for (f in frames) {
            f.copyInto(merged, offset)
            offset += f.size
        }
        onSpeechSegment(merged)
    }
}
