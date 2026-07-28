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

    @SuppressLint("MissingPermission") // 호출부(WakeWordService)에서 RECORD_AUDIO 권한을 먼저 확인한다.
    fun start() {
        if (recording) return

        val minBufferSize = AudioRecord.getMinBufferSize(
            SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
        )
        val bufferSize = maxOf(minBufferSize, FRAME_SAMPLES * 2 * 4)

        val record = AudioRecord(
            MediaRecorder.AudioSource.VOICE_RECOGNITION,
            SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            bufferSize,
        )

        if (record.state != AudioRecord.STATE_INITIALIZED) {
            record.release()
            return
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
