package com.neurocare.app.wakeword

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import kotlin.concurrent.thread

/** 마이크에서 16kHz mono PCM을 계속 읽어 [FRAME_SAMPLES]개씩 콜백으로 넘긴다. */
class AudioCapture(private val onFrame: (FloatArray) -> Unit) {
    private var audioRecord: AudioRecord? = null

    @Volatile
    private var recording = false
    private var thread: Thread? = null

    /**
     * 성공하면 true. 직전에 서비스가 껐다 켜지는 등으로 안드로이드가 아직 이전 오디오
     * 세션을 다 정리하지 못한 찰나에는 AudioRecord 초기화가 실패할 수 있는데, 예전엔
     * 이걸 그냥 조용히 포기해서(실패해도 로그/신호 없음) "마이크가 있는 척"만 하고
     * 실제로는 아무 소리도 못 듣는 상태로 남아있었다 - 앱을 완전히 껐다 켜야만
     * 되살아나는 것처럼 보였던 원인 후보. 실패를 호출부에 알려 재시도할 수 있게 한다.
     */
    @SuppressLint("MissingPermission") // 호출부(WakeWordService)에서 RECORD_AUDIO 권한을 먼저 확인한다.
    fun start(): Boolean {
        if (recording) return true

        val minBufferSize = AudioRecord.getMinBufferSize(
            SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
        )
        val bufferSize = maxOf(minBufferSize, FRAME_SAMPLES * 2 * 4)

        val record = AudioRecord(
            MediaRecorder.AudioSource.MIC,
            SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            bufferSize,
        )

        if (record.state != AudioRecord.STATE_INITIALIZED) {
            record.release()
            return false
        }

        audioRecord = record
        recording = true
        record.startRecording()

        thread = thread(start = true, name = "neurocare-audio-capture") {
            val shortBuffer = ShortArray(FRAME_SAMPLES)
            while (recording) {
                val read = record.read(shortBuffer, 0, FRAME_SAMPLES)
                if (read == FRAME_SAMPLES) {
                    val frame = FloatArray(FRAME_SAMPLES) { i -> shortBuffer[i] / 32768f }
                    onFrame(frame)
                }
            }
        }
        return true
    }

    fun stop() {
        recording = false
        thread?.join(500)
        thread = null
        audioRecord?.apply {
            runCatching { stop() }
            release()
        }
        audioRecord = null
    }

    companion object {
        const val SAMPLE_RATE = 16000
        /** vad-web의 "legacy" Silero 모델과 동일한 프레임 크기 (16kHz 기준 96ms). */
        const val FRAME_SAMPLES = 1536
    }
}
