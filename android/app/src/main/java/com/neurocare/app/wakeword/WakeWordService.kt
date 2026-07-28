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

        audioCapture = AudioCapture { frame ->
            // MainActivity(WebView)가 화면에 떠 있는 동안은 그쪽이 마이크를 쓰므로 겹치지 않게 쉰다.
            if (!isAppInForeground) {
                segmenter?.processFrame(frame)
            }
        }.also { it.start() }
    }

    private fun hasMicPermission() =
        ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) ==
            PackageManager.PERMISSION_GRANTED

    private fun handleSpeechSegment(segment: FloatArray) {
        if (checkingWakeWord || isAppInForeground) return
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

    override fun onDestroy() {
        super.onDestroy()
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

        /** MainActivity가 onResume/onPause에서 갱신한다. */
        @Volatile
        var isAppInForeground: Boolean = false
    }
}
