package com.neurocare.app.wakeword

import ai.onnxruntime.OrtEnvironment
import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.neurocare.app.BuildConfig
import com.neurocare.app.MainActivity
import com.neurocare.app.R
import kotlin.concurrent.thread
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

/**
 * 앱이 화면에 없을 때(=백그라운드/화면 꺼짐) 계속 마이크를 감시하다가, 설정한 이름이
 * 들리면 [MainActivity]를 깨우는 포그라운드 서비스. 이름을 부르기 전까지는 오디오를
 * VAD로만 판단하고, 실제로 사람 목소리 구간이 감지될 때만 whisper 서버에 전사를 요청한다
 * (매 프레임 서버로 보내지 않음 - 배터리/네트워크 절약).
 */
class WakeWordService : Service() {

    private var vad: SileroVad? = null
    private var segmenter: SpeechSegmenter? = null
    private var audioCapture: AudioCapture? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private lateinit var whisperClient: WhisperClient

    @Volatile
    private var checkingWakeWord = false

    /** 성문 등록 전인지. 등록 전에는 목소리를 가리지 않고 누구 말이든 호출어를 받는다. */
    @Volatile
    private var enrolled = false

    /** 등록에 쓸 오디오. "복실아"라고 불린 구간만 모아서 그 사람 목소리임을 보장한다. */
    private val enrollBuffer = mutableListOf<FloatArray>()

    override fun onCreate() {
        super.onCreate()
        reportToServer("onCreate 시작")
        startForeground(NOTIFICATION_ID, buildNotification())

        // 화면이 꺼져도 CPU가 멈추면 오디오 캡처 스레드가 같이 죽는다.
        wakeLock = (getSystemService(POWER_SERVICE) as PowerManager)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "neurocare:wakeword")
            .apply { setReferenceCounted(false); acquire() }

        whisperClient = WhisperClient(BuildConfig.BACKEND_HTTP_BASE)
        thread(name = "neurocare-enroll-status") {
            enrolled = whisperClient.isEnrolled(BuildConfig.SPEAKER_ID)
        }

        if (!hasMicPermission()) {
            Log.w(TAG, "RECORD_AUDIO 권한이 없어 웨이크워드 감시를 시작하지 않습니다.")
            return
        }

        val ortEnv = OrtEnvironment.getEnvironment()
        val modelBytes = assets.open("silero_vad_legacy.onnx").use { it.readBytes() }
        val sileroVad = SileroVad(ortEnv, modelBytes)
        vad = sileroVad

        segmenter = SpeechSegmenter(sileroVad) { segment -> handleSpeechSegment(segment) }

        // 이 서비스는 이제 MainActivity가 백그라운드로 갈 때만 시작되고, 화면에 돌아오면
        // 통째로 종료된다(MainActivity.onResume/onPause 참고) - "마이크 사용" 포그라운드
        // 서비스가 실제 녹음 여부와 무관하게 떠 있는 것만으로 같은 앱의 WebView 오디오 세션과
        // 충돌해 getUserMedia가 NotReadableError로 실패하는 게 실기기 로그로 확인됐기 때문이다.
        // 그래서 살아있는 동안은 항상 바로 캡처를 시작한다 - 켜져 있으면서 안 듣는 상태는 없다.
        audioCapture = AudioCapture { frame -> segmenter?.processFrame(frame) }
        audioCapture?.start()
        reportToServer("웨이크워드 감시 시작(마이크 잡음)")
    }

    private fun reportToServer(message: String) {
        thread(name = "neurocare-wakeword-log") {
            try {
                val body = JSONObject().put("message", "[웨이크워드] $message").toString()
                    .toRequestBody("application/json".toMediaType())
                val request = Request.Builder()
                    .url("${BuildConfig.WEBAPP_BASE_URL}/api/client-log")
                    .post(body)
                    .build()
                OkHttpClient().newCall(request).execute().close()
            } catch (e: Exception) {
                Log.e(TAG, "원격 로그 전송 실패", e)
            }
        }
    }

    private fun hasMicPermission() =
        ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) ==
            PackageManager.PERMISSION_GRANTED

    private fun handleSpeechSegment(segment: FloatArray) {
        if (checkingWakeWord) return
        if (computeDbfs(segment) < MIN_SPEECH_DBFS) {
            // 다른 방 TV나 대화처럼 멀리서 들린 소리 - VAD는 "말소리"로 보지만 whisper까지
            // 보내면 배경 소음이 우연히 호출어와 비슷하게 인식되어 안 불렀는데 깨어나는
            // 오탐(false wake)의 주된 원인이 된다. 웹 대화 엔진의 MIN_SPEECH_DBFS와 동일 기준.
            return
        }
        checkingWakeWord = true
        thread(name = "neurocare-wakeword-check") {
            try {
                // 등록 후에는 speakerId를 넘겨 본인 목소리가 아니면 빈 텍스트를 받는다.
                val text = whisperClient.transcribe(
                    segment,
                    speakerId = if (enrolled) BuildConfig.SPEAKER_ID else null,
                )
                val target = normalize(BuildConfig.WAKE_WORD_LABEL)
                if (target.isEmpty() || !normalize(text).contains(target)) return@thread

                Log.d(TAG, "호출어 감지: \"$text\"")
                if (!enrolled) rememberVoice(segment)
                launchMainActivity()
            } finally {
                checkingWakeWord = false
            }
        }
    }

    /**
     * 처음 "복실아"라고 부른 사람의 목소리를 성문으로 저장한다.
     * 호출어 한 번(약 1초)은 성문을 만들기에 짧아서, 호출어로 확인된 구간만 모아
     * 백엔드가 요구하는 길이에 도달하면 등록한다. 그동안에도 앱은 정상적으로 열린다.
     */
    private fun rememberVoice(segment: FloatArray) {
        synchronized(enrollBuffer) {
            enrollBuffer += segment
            val merged = FloatArray(enrollBuffer.sumOf { it.size })
            var offset = 0
            for (chunk in enrollBuffer) {
                chunk.copyInto(merged, offset)
                offset += chunk.size
            }
            if (whisperClient.enroll(BuildConfig.SPEAKER_ID, merged)) {
                enrolled = true
                enrollBuffer.clear()
                Log.i(TAG, "목소리 등록 완료 - 이제 이 목소리만 반응한다")
            }
        }
    }

    private fun launchMainActivity() {
        val intent = Intent(this, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        startActivity(intent)
    }

    private fun normalize(text: String) = text.replace(Regex("\\s+"), "").lowercase()

    /** 발화 구간의 평균 음량(dBFS). hooks/useConversationEngine.ts의 computeDbfs와 동일 계산. */
    private fun computeDbfs(samples: FloatArray): Double {
        var sumSquares = 0.0
        for (s in samples) sumSquares += s.toDouble() * s.toDouble()
        val rms = kotlin.math.sqrt(sumSquares / samples.size)
        return if (rms > 0) 20 * kotlin.math.log10(rms) else Double.NEGATIVE_INFINITY
    }

    override fun onDestroy() {
        super.onDestroy()
        reportToServer("onDestroy: 마이크 놓아줌")
        audioCapture?.stop()
        vad?.close()
        wakeLock?.takeIf { it.isHeld }?.release()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun buildNotification(): Notification {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NotificationManager::class.java)
            val channel = NotificationChannel(
                CHANNEL_ID,
                getString(R.string.notification_channel_name),
                NotificationManager.IMPORTANCE_LOW,
            )
            manager.createNotificationChannel(channel)
        }

        val openAppIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE,
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.notification_title))
            .setContentText(getString(R.string.notification_text))
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentIntent(openAppIntent)
            .setOngoing(true)
            .build()
    }

    companion object {
        private const val TAG = "WakeWordService"
        private const val CHANNEL_ID = "wakeword_channel"
        private const val NOTIFICATION_ID = 1

        /** 이보다 작으면(=조용/먼 소리) whisper 호출 없이 무시한다. */
        private const val MIN_SPEECH_DBFS = -40.0
    }
}
