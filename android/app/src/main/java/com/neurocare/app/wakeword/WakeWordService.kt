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
import android.speech.tts.TextToSpeech
import android.util.Log
import java.util.Locale
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
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

    /**
     * 호출어에 "네, 부르셨어요"로 바로 답하는 용도. 이걸 웹 대화 엔진(LLM/STT) 쪽으로
     * 넘기면 그 순간 마이크에 우연히 섞인 잡음까지 같이 넘어가 엉뚱한 대화로 새는 문제가
     * 있었다 - 안드로이드 기본 TTS로 완전히 분리해서 무조건 빠르고 예측 가능하게 만든다.
     */
    private var ackTts: TextToSpeech? = null

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

        ackTts = TextToSpeech(this) { status ->
            if (status == TextToSpeech.SUCCESS) ackTts?.language = Locale.KOREAN
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
        val dbfs = computeDbfs(segment)
        // ponytail: 호출어가 왜 감지 안 되는지 원격으로 확인하려고 매 구간마다 남긴다.
        // 원인이 잡히면 이 report 호출만 지운다.
        reportToServer("발화 구간 감지 dbfs=$dbfs (기준 $MIN_SPEECH_DBFS)")
        if (dbfs < MIN_SPEECH_DBFS) {
            // 다른 방 TV나 대화처럼 멀리서 들린 소리를 거르려던 기준인데, 실기기 로그로
            // 확인해보니 바로 앞에서 또렷하게 부른 "복실아"도 -55dBFS 근처로 측정돼
            // 기존 기준(-40, 웹 getUserMedia 경로에서 튜닝된 값)에 전부 걸려 무시되고
            // 있었다. 네이티브 AudioRecord 경로는 게인 특성이 달라 같은 기준을 못 쓴다.
            return
        }
        checkingWakeWord = true
        // VOICE_RECOGNITION 마이크 소스는 AGC(자동 볼륨 보정) 없이 순수 원음만 준다.
        // 실기기 로그로 확인해보니 또렷하게 부른 소리도 -55~-61dBFS로 너무 작게 잡혀
        // whisper가 빈 텍스트를 돌려줬다 - 보내기 전에 소프트웨어로 키운다.
        val boosted = normalizeGain(segment)
        thread(name = "neurocare-wakeword-check") {
            try {
                // 등록 후에는 speakerId를 넘겨 본인 목소리가 아니면 빈 텍스트를 받는다.
                val text = whisperClient.transcribe(
                    boosted,
                    speakerId = if (enrolled) BuildConfig.SPEAKER_ID else null,
                )
                reportToServer("전사 결과: \"$text\" (enrolled=$enrolled)")
                val targetJamo = decomposeHangul(normalize(BuildConfig.WAKE_WORD_LABEL))
                if (targetJamo.isEmpty()) return@thread
                val dist = approxEditDistance(decomposeHangul(normalize(text)), targetJamo)
                reportToServer("호출어 자모거리: $dist (기준 <=$WAKE_WORD_MAX_JAMO_DIST)")
                if (dist > WAKE_WORD_MAX_JAMO_DIST) return@thread

                Log.d(TAG, "호출어 감지: \"$text\"")
                ackTts?.speak("네, 부르셨어요", TextToSpeech.QUEUE_FLUSH, null, "wake-ack")
                if (!enrolled) rememberVoice(boosted)
                launchMainActivity()
            } finally {
                checkingWakeWord = false
            }
        }
    }

    /**
     * 오디오 피크를 목표 수준까지 끌어올려 whisper가 들을 수 있게 한다. 잡음까지 과도하게
     * 증폭되지 않도록 게인에 상한을 둔다 - 이미 dBFS 기준을 통과한(=먼 소리는 아닌) 구간만
     * 여기 온다.
     */
    private fun normalizeGain(samples: FloatArray): FloatArray {
        val peak = samples.maxOf { kotlin.math.abs(it) }
        if (peak <= 0f) return samples
        val gain = (0.9f / peak).coerceAtMost(20f)
        return FloatArray(samples.size) { i -> (samples[i] * gain).coerceIn(-1f, 1f) }
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

    /**
     * 안드로이드 10+는 백그라운드 서비스에서의 startActivity()를 조용히 막을 수 있다
     * (특히 최근 버전일수록 더 엄격함) - 그래서 호출어가 인식돼도 화면이 안 켜지는
     * 증상이 있었다. EmergencyAlertActivity와 같은 방식(전체화면 알림)을 쓰면 이 제약을
     * 우회해 확실하게 액티비티가 뜬다.
     *
     * ponytail 교훈: 여기에 안전망으로 startActivity()도 같이 불렀다가, 화면이 꺼진
     * 상태(=이 앱의 실제 사용 시나리오)에서는 전체화면 알림이 자동으로도 열리면서
     * 액티비티/웹뷰가 두 번 뜨는 레이스가 생겨 TTS 오디오가 겹쳐 재생됐다.
     * 알림 하나에만 맡긴다 - EmergencyAlertActivity도 원래 이렇게만 한다.
     */
    private fun launchMainActivity() {
        val intent = Intent(this, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }

        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                WAKE_ALERT_CHANNEL_ID,
                "호출어 감지",
                NotificationManager.IMPORTANCE_HIGH,
            )
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }

        val notification = NotificationCompat.Builder(this, WAKE_ALERT_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentTitle(getString(R.string.notification_title))
            .setContentText("\"${BuildConfig.WAKE_WORD_LABEL}\" 호출을 들었어요")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setFullScreenIntent(pendingIntent, true)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .build()
        NotificationManagerCompat.from(this).notify(WAKE_NOTIFICATION_ID, notification)
    }

    private fun normalize(text: String) = text.replace(Regex("\\s+"), "").lowercase()

    /**
     * 완성형 한글 음절을 초성/중성/종성 자모로 풀어헤친다(유니코드 산술 분해).
     * whisper가 "복실아"처럼 낯선 짧은 단어를 음이 비슷한 흔한 단어("봅시다")로 잘못
     * 알아듣는 경우가 많아서, 글자 단위 완전 일치 대신 자모 단위 편집거리로 "소리가
     * 비슷한지"를 비교한다 - 글자는 달라도 초성/중성이 겹치면 편집거리가 작게 나온다.
     */
    private fun decomposeHangul(text: String): List<Char> {
        val jamo = mutableListOf<Char>()
        for (ch in text) {
            val code = ch.code - 0xAC00
            if (code < 0 || code > 11171) {
                jamo.add(ch)
                continue
            }
            val initial = code / (21 * 28)
            val medial = (code / 28) % 21
            val final = code % 28
            jamo.add(HANGUL_INITIALS[initial])
            jamo.add(HANGUL_MEDIALS[medial])
            if (final != 0) jamo.add(HANGUL_FINALS[final])
        }
        return jamo
    }

    /** text 안 어딘가에 target이 [편집거리 이하]로 들어있으면 그 최소 편집거리를 돌려준다(자유 시작점 DP). */
    private fun approxEditDistance(text: List<Char>, target: List<Char>): Int {
        if (target.isEmpty()) return Int.MAX_VALUE
        var prev = IntArray(target.size + 1) { it }
        for (tc in text) {
            val curr = IntArray(target.size + 1)
            curr[0] = 0
            for (j in 1..target.size) {
                val cost = if (tc == target[j - 1]) 0 else 1
                curr[j] = minOf(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
            }
            prev = curr
        }
        return prev.min()
    }

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
        ackTts?.shutdown()
        ackTts = null
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
        private const val WAKE_ALERT_CHANNEL_ID = "wakeword_alert_channel"
        private const val WAKE_NOTIFICATION_ID = 2

        /** 이보다 작으면(=조용/먼 소리) whisper 호출 없이 무시한다. */
        // 실기기 측정치(-55.5dBFS로 부른 "복실아"가 걸러짐) 기준으로 여유를 두고 낮췄다.
        private const val MIN_SPEECH_DBFS = -62.0

        /**
         * 호출어 자모 편집거리 허용치. 실기기 로그에서 "복실아"가 "봅시다"로 오인식된
         * 사례(자모 8개 중 다수 불일치)를 근거로 잡은 값 - 너무 크면 무관한 말에도
         * 반응하고, 너무 작으면 여전히 놓친다. 오탐/미탐 로그 보고 조정.
         */
        private const val WAKE_WORD_MAX_JAMO_DIST = 4

        // 유니코드 한글 완성형 분해표(초성 19 / 중성 21 / 종성 28, 종성 0번=받침 없음).
        private val HANGUL_INITIALS =
            "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ".toList()
        private val HANGUL_MEDIALS =
            "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ".toList()
        private val HANGUL_FINALS =
            " ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ".toList()
    }
}
