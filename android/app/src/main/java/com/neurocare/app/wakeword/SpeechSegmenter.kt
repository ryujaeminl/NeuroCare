package com.neurocare.app.wakeword

/**
 * 프레임 단위 VAD 확률을 발화 구간(세그먼트)으로 묶는 상태머신.
 * 웹의 vad-web `frame-processor.ts`와 같은 파라미터(threshold/redemption/preSpeechPad/
 * minSpeech)를 그대로 옮겨서, 웹에서 튜닝해 검증한 동작을 그대로 재현한다.
 */
class SpeechSegmenter(
    private val vad: SileroVad,
    private val positiveSpeechThreshold: Float = 0.6f,
    private val negativeSpeechThreshold: Float = 0.45f,
    redemptionMs: Int = 1400,
    preSpeechPadMs: Int = 800,
    minSpeechMs: Int = 400,
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
