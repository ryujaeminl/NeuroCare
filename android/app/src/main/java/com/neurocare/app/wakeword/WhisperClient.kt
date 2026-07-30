package com.neurocare.app.wakeword

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.TimeUnit

/** FastAPI(faster-whisper) `/transcribe`를 직접 호출한다 - 네이티브 HTTP 호출이라 CORS와 무관하다. */
class WhisperClient(private val baseUrl: String) {
    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    /**
     * 실패해도 예외를 던지지 않고 빈 문자열을 반환한다 (백그라운드 감시 루프이므로).
     * speakerId를 넘기면 백엔드가 등록된 성문과 비교해, 다른 사람 목소리면 빈 텍스트를 준다.
     */
    fun transcribe(
        samples: FloatArray,
        speakerId: String? = null,
        sampleRate: Int = AudioCapture.SAMPLE_RATE,
    ): String {
        return try {
            val body = MultipartBody.Builder()
                .setType(MultipartBody.FORM)
                .addFormDataPart(
                    "file",
                    "segment.wav",
                    encodeWav(samples, sampleRate).toRequestBody("audio/wav".toMediaType()),
                )
                .apply { if (speakerId != null) addFormDataPart("speaker_id", speakerId) }
                .build()
            val request = Request.Builder().url("$baseUrl/transcribe").post(body).build()
            client.newCall(request).execute().use { response ->
                val bodyString = response.body?.string()
                if (!response.isSuccessful || bodyString == null) return ""
                JSONObject(bodyString).optString("text", "")
            }
        } catch (e: Exception) {
            ""
        }
    }

    private fun encodeWav(samples: FloatArray, sampleRate: Int): ByteArray {
        val dataSize = samples.size * 2
        val header = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)
        header.put("RIFF".toByteArray())
        header.putInt(36 + dataSize)
        header.put("WAVE".toByteArray())
        header.put("fmt ".toByteArray())
        header.putInt(16)
        header.putShort(1) // PCM
        header.putShort(1) // mono
        header.putInt(sampleRate)
        header.putInt(sampleRate * 2)
        header.putShort(2)
        header.putShort(16)
        header.put("data".toByteArray())
        header.putInt(dataSize)

        val dataBuffer = ByteBuffer.allocate(dataSize).order(ByteOrder.LITTLE_ENDIAN)
        for (s in samples) {
            val clamped = s.coerceIn(-1f, 1f)
            val scale = if (clamped < 0f) 32768f else 32767f
            dataBuffer.putShort((clamped * scale).toInt().toShort())
        }

        val out = ByteArrayOutputStream(44 + dataSize)
        out.write(header.array())
        out.write(dataBuffer.array())
        return out.toByteArray()
    }
}
