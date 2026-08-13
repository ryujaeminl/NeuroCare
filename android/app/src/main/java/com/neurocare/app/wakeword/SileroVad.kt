package com.neurocare.app.wakeword

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import java.nio.FloatBuffer
import java.nio.LongBuffer

/**
 * Silero VAD(legacy, LSTM 기반) ONNX 모델 추론 래퍼.
 * 웹 버전(@ricky0123/vad-web)이 쓰는 것과 동일한 `public/vad/silero_vad_legacy.onnx`를
 * 그대로 재사용한다. 입력: 16kHz 오디오 프레임 + 샘플레이트 + LSTM h/c 상태.
 * 출력: 발화 확률(0~1) + 다음 호출에 넘길 갱신된 h/c 상태.
 */
class SileroVad(private val env: OrtEnvironment, modelBytes: ByteArray) : AutoCloseable {
    private val session: OrtSession = env.createSession(modelBytes, OrtSession.SessionOptions())

    private var h = FloatArray(STATE_SIZE)
    private var c = FloatArray(STATE_SIZE)

    fun resetState() {
        h = FloatArray(STATE_SIZE)
        c = FloatArray(STATE_SIZE)
    }

    /** frame은 [AudioCapture.FRAME_SAMPLES]개의 -1..1 float 샘플. 반환값은 발화 확률(0~1). */
    fun process(frame: FloatArray): Float {
        OnnxTensor.createTensor(env, FloatBuffer.wrap(frame), longArrayOf(1, frame.size.toLong())).use { input ->
            OnnxTensor.createTensor(env, LongBuffer.wrap(longArrayOf(SAMPLE_RATE)), longArrayOf()).use { sr ->
                OnnxTensor.createTensor(env, FloatBuffer.wrap(h), longArrayOf(2, 1, 64)).use { hTensor ->
                    OnnxTensor.createTensor(env, FloatBuffer.wrap(c), longArrayOf(2, 1, 64)).use { cTensor ->
                        val inputs = mapOf(
                            "input" to input,
                            "sr" to sr,
                            "h" to hTensor,
                            "c" to cTensor,
                        )
                        session.run(inputs).use { result ->
                            @Suppress("UNCHECKED_CAST")
                            val output = (result[0].value as Array<FloatArray>)[0][0]
                            h = flatten3D(result.get("hn").get().value)
                            c = flatten3D(result.get("cn").get().value)
                            return output
                        }
                    }
                }
            }
        }
    }

    @Suppress("UNCHECKED_CAST")
    private fun flatten3D(value: Any): FloatArray {
        val arr3d = value as Array<Array<FloatArray>>
        val out = FloatArray(STATE_SIZE)
        var offset = 0
        for (a in arr3d) {
            for (b in a) {
                b.copyInto(out, offset)
                offset += b.size
            }
        }
        return out
    }

    override fun close() {
        session.close()
    }

    companion object {
        const val SAMPLE_RATE = 16000L
        private const val STATE_SIZE = 2 * 1 * 64
    }
}
