package com.neurocare.app

import android.Manifest
import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.util.Log
import android.webkit.ConsoleMessage
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.webkit.WebViewCompat
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.neurocare.app.emergency.EmergencyNotifier
import com.neurocare.app.wakeword.WakeWordService
import kotlin.concurrent.thread
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

/**
 * 웨이크워드로 켜지든 사용자가 직접 앱 아이콘을 누르든, 이 액티비티 하나가 전부다.
 * 실제 대화 화면(대시보드, VAD, 턴 종료, LLM 스트리밍, TTS, barge-in)은 전부 기존
 * Next.js 웹앱이 WebView 안에서 그대로 담당한다 - 새로 만들지 않는다.
 */
class MainActivity : AppCompatActivity() {

    private companion object {
        const val TAG = "NeurocareWebView"
    }

    private lateinit var webView: WebView

    /**
     * MainActivity는 웨이크워드로 잠금화면 위에 뜨기 위해 showWhenLocked/turnScreenOn을
     * 매니페스트에 켜 두는데, 실기기 확인 결과 이 플래그 때문에 사용자가 그냥 전원 버튼으로
     * 화면을 끄기만 해도(=실사용에서 가장 흔한 시나리오) onPause가 아예 호출되지 않는다
     * (홈 버튼으로 나가는 건 정상적으로 onPause가 호출됨 - 실기기 dumpsys로 확인).
     * 그래서 웨이크워드 서비스가 영영 시작되지 않아 "복실아"를 불러도 반응이 없었다.
     * 화면 꺼짐은 실제 물리 신호(ACTION_SCREEN_OFF)로 직접 감지해 보완한다.
     */
    /**
     * 화면 꺼짐(ACTION_SCREEN_OFF)은 onPause()가 아예 안 불려서(위 주석 참고) 거기서
     * 보내는 정지 신호도 안 나간다 - 여기서 직접 웹 대화엔진 정지 신호를 보낸다.
     * 반대로 화면이 다시 켜질 때(ACTION_SCREEN_ON)도 액티비티가 애초에 멈춘 적이
     * 없으므로 onResume()이 다시 불리지 않는다 - 대칭으로 여기서 재개 신호를 보내지
     * 않으면 화면만 껐다 켰을 뿐인데 마이크가 영영 안 켜지는 문제가 생긴다.
     */
    private val screenPowerReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                Intent.ACTION_SCREEN_OFF -> {
                    reportToServer("ACTION_SCREEN_OFF: 웹 대화엔진 정지 + 웨이크워드 서비스 시작(onPause 보완)")
                    webView.evaluateJavascript("window.__neurocarePause && window.__neurocarePause()", null)
                    startWakeWordService()
                }
                Intent.ACTION_SCREEN_ON -> {
                    reportToServer("ACTION_SCREEN_ON: 웹 대화엔진 재개 + 웨이크워드 서비스 종료(onResume 보완)")
                    stopWakeWordService()
                    webView.evaluateJavascript("window.__neurocareResume && window.__neurocareResume()", null)
                }
            }
        }
    }

    /**
     * 웹앱(JS)이 "대화가 끝나고 조용해졌다"고 판단하면 앱을 완전히 닫아 백그라운드 호출어
     * 감시로 돌아가기 위한 다리. finish()만 부르면 onPause()가 정상적으로 뒤이어 호출되어
     * (웹 대화엔진 정지 신호 전송 + 웨이크워드 서비스 시작) 별도 처리가 필요 없다.
     */
    private inner class WebAppBridge {
        @JavascriptInterface
        fun closeApp() {
            runOnUiThread {
                moveTaskToBack(true)
                finish()
            }
        }

        /**
         * 웹앱이 로그인한 환자의 커스텀 호출어를 알아내면(app/api/patient/wake-word) 이걸로
         * 넘겨준다 - WakeWordService(백그라운드 감시)는 세션/쿠키가 없어 직접 API를 못
         * 부르므로, 이미 인증된 웹 레이어가 대신 알려주는 구조다. SharedPreferences에
         * 저장해두면 WakeWordService.currentWakeWord()가 다음 감시 시작 때부터 읽는다.
         */
        @JavascriptInterface
        fun setWakeWord(word: String) {
            getSharedPreferences(WakeWordService.WAKE_WORD_PREFS, MODE_PRIVATE)
                .edit()
                .putString(WakeWordService.WAKE_WORD_PREF_KEY, word)
                .apply()
        }
    }

    /** WebView가 마이크를 요청했는데 안드로이드 권한이 없을 때, 권한 응답을 기다리는 요청. */
    private var pendingMicRequest: PermissionRequest? = null

    private val requestMicForWebView =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            val request = pendingMicRequest
            pendingMicRequest = null
            if (granted) {
                request?.grant(request.resources)
                // 권한이 생겼으니 마이크를 못 잡아 멈춰 있던 페이지를 다시 띄운다.
                webView.reload()
            } else {
                request?.deny()
                showError("마이크 권한이 없어 대화를 시작할 수 없습니다.")
            }
        }

    private val requestPermissions =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
            // 결과와 상관없이 마이크 권한 요청은 WebView의 onPermissionRequest에서 다시 확인한다.
            // 웨이크워드 서비스는 여기서 켜지 않는다 - onPause에서 백그라운드로 갈 때만 띄운다.
            webView.loadUrl(BuildConfig.WEBAPP_BASE_URL)
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 이 앱은 환자용 웨이크워드 래퍼지만, 긴급 알림 채널은 앱 시작 시 한 번만 등록하면
        // 되고 만들어 두어도 해가 없어서 여기서 같이 준비한다 - 실제 알림 발송은 보호자 쪽에서
        // 일어난다 (EmergencyNotifier 문서 참고).
        EmergencyNotifier.createChannel(this)
        // 안드로이드 14+는 전체화면 알림 권한이 기본 꺼짐 상태라, 없으면 웨이크워드로
        // 부를 때도, 긴급 알림 때도 화면이 자동으로 안 뜬다. 한 번 켜두면 계속 유지된다.
        EmergencyNotifier.ensureFullScreenIntentPermission(this)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
            val keyguardManager = getSystemService(KeyguardManager::class.java)
            keyguardManager?.requestDismissKeyguard(this, null)
        }

        // 잠금화면 위에서도 즉시 켜지고 화면이 꺼지지 않도록 윈도우 플래그를 설정한다.
        window.addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
            WindowManager.LayoutParams.FLAG_ALLOW_LOCK_WHILE_SCREEN_ON or
            WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
            WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
            WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
        )

        registerReceiver(
            screenPowerReceiver,
            IntentFilter().apply {
                addAction(Intent.ACTION_SCREEN_OFF)
                addAction(Intent.ACTION_SCREEN_ON)
            },
        )

        webView = WebView(this)
        setContentView(webView)
        setupWebView()

        // WebView가 오래되면 최신 JS 문법을 파싱하지 못해 화면만 그려지고 아무 동작도 하지 않는다.
        // 진단에 필요한 정보라 시작 시 한 번 남긴다.
        val webViewVersion = WebViewCompat.getCurrentWebViewPackage(this)?.versionName ?: "알 수 없음"
        Log.i(TAG, "WebView 버전: $webViewVersion")
        // ponytail: 기기에서 흰 화면/엉뚱한 URL 문제가 재현될 때 이 값들이 실제로 뭘로 컴파일됐는지
        // 원격에서 바로 확인하려고 남긴다. 원인이 잡히면 지운다.
        reportToServer(
            "시작: WEBAPP_BASE_URL=${BuildConfig.WEBAPP_BASE_URL} " +
                "versionCode=${BuildConfig.VERSION_CODE} versionName=${BuildConfig.VERSION_NAME} " +
                "webview=$webViewVersion",
        )

        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    if (webView.canGoBack()) {
                        webView.goBack()
                    } else {
                        isEnabled = false
                        onBackPressedDispatcher.onBackPressed()
                    }
                }
            },
        )

        ensurePermissionsThenStart()
    }

    private fun setupWebView() {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            // 개발 서버를 다시 빌드하면 JS 청크 파일명이 바뀐다. 캐시된 HTML이 사라진 옛
            // 청크를 계속 가리키면 화면만 그려지고 스크립트가 하나도 안 붙는다.
            cacheMode = WebSettings.LOAD_NO_CACHE
        }
        webView.clearCache(true)
        webView.addJavascriptInterface(WebAppBridge(), "Android")

        // 자체서명 인증서 신뢰는 res/xml/network_security_config.xml에서 처리한다.
        // onReceivedSslError로 우회하면 메인 프레임만 통과하고 JS 청크 같은 하위 리소스는
        // 조용히 차단되어, 화면은 그려지는데 아무것도 동작하지 않는 상태가 된다.

        // WebView 안에서 난 오류는 밖에서 보이지 않는다. 화면이 굳었을 때 원인을 알 수 있도록
        // 로딩 실패와 JS 오류를 화면(토스트)과 logcat 양쪽에 드러낸다.
        webView.webViewClient = object : WebViewClient() {
            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?,
            ) {
                val url = request?.url?.toString().orEmpty()
                val detail = "로딩 실패: ${error?.description} ($url)"
                Log.e(TAG, detail)
                // 하위 리소스(JS 청크) 실패도 보여준다. 메인 프레임만 보면 화면은 멀쩡한데
                // 스크립트만 죽은 상태를 놓친다 - 실제로 이것 때문에 원인을 늦게 찾았다.
                showError(detail)
            }

            override fun onReceivedHttpError(
                view: WebView?,
                request: WebResourceRequest?,
                errorResponse: WebResourceResponse?,
            ) {
                val detail = "HTTP ${errorResponse?.statusCode}: ${request?.url}"
                Log.e(TAG, detail)
                // 401은 "로그인 안 됨"일 뿐이고 웹 쪽에서 이미 조용히 처리한다(예: 기분 카드는
                // 실패해도 그냥 넘어감) - 실제 버그가 아닌데 매번 토스트로 놀라게 할 필요 없다.
                if (errorResponse?.statusCode != 401) showError(detail)
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                // 에러 콜백 없이 200으로 로드됐는데도 화면이 비어있는(=React가 마운트 전에
                // 죽은) 경우는 위 콜백들이 전혀 못 잡는다. 실제로 그려진 글자 수로 확인한다.
                view?.evaluateJavascript("document.body.innerText.length") { result ->
                    val textLength = result?.toIntOrNull() ?: -1
                    if (textLength in 0..10) {
                        reportToServer("빈 화면 의심: url=$url bodyTextLength=$textLength")
                    }
                }
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(message: ConsoleMessage): Boolean {
                if (message.messageLevel() == ConsoleMessage.MessageLevel.ERROR) {
                    val detail = "JS 오류: ${message.message()} (${message.sourceId()}:${message.lineNumber()})"
                    Log.e(TAG, detail)
                    showError(detail)
                }
                return true
            }

            override fun onPermissionRequest(request: PermissionRequest) {
                val wantsMic = request.resources.any { it == PermissionRequest.RESOURCE_AUDIO_CAPTURE }
                if (!wantsMic) {
                    request.deny()
                    return
                }

                val granted = ContextCompat.checkSelfPermission(
                    this@MainActivity,
                    Manifest.permission.RECORD_AUDIO,
                ) == PackageManager.PERMISSION_GRANTED

                if (granted) {
                    request.grant(request.resources)
                    return
                }

                // 안드로이드 권한이 아직 없으면 그냥 거부하면 안 된다. 웹은 NotAllowedError만 받고
                // 사용자는 영영 마이크를 못 쓴다. 여기서 실제로 권한을 물어보고 결과에 따라 처리한다.
                pendingMicRequest = request
                requestMicForWebView.launch(Manifest.permission.RECORD_AUDIO)
            }
        }
    }

    /** 같은 오류가 연달아 쏟아지면 토스트가 도배되므로 처음 것만 보여준다. */
    private var lastShownError: String? = null

    private fun showError(detail: String) {
        if (detail == lastShownError) return
        lastShownError = detail
        runOnUiThread { Toast.makeText(this, detail.take(300), Toast.LENGTH_LONG).show() }
        reportToServer(detail)
    }

    /**
     * WebView가 실패하는 바로 그 순간엔 자기 자신을 통해 서버에 보고할 수 없으므로,
     * WebView와 무관한 별도의 OkHttp 연결로 배포 서버에 직접 올린다.
     * ponytail: 진단용. 원인이 잡히면 지운다.
     */
    private val diagnosticsClient = OkHttpClient()

    private fun reportToServer(message: String) {
        thread(name = "neurocare-client-log") {
            try {
                val body = JSONObject().put("message", message).toString()
                    .toRequestBody("application/json".toMediaType())
                val request = Request.Builder()
                    .url("${BuildConfig.WEBAPP_BASE_URL}/api/client-log")
                    .post(body)
                    .build()
                diagnosticsClient.newCall(request).execute().close()
            } catch (e: Exception) {
                Log.e(TAG, "원격 로그 전송 실패", e)
            }
        }
    }

    private fun ensurePermissionsThenStart() {
        val needed = mutableListOf(Manifest.permission.RECORD_AUDIO)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            needed += Manifest.permission.POST_NOTIFICATIONS
        }

        val missing = needed.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }

        if (missing.isEmpty()) {
            // 웨이크워드 서비스는 여기서 켜지 않는다 - onPause에서 백그라운드로 갈 때만 띄운다.
            webView.loadUrl(BuildConfig.WEBAPP_BASE_URL)
        } else {
            requestPermissions.launch(missing.toTypedArray())
        }
    }

    private fun startWakeWordService() {
        val intent = Intent(this, WakeWordService::class.java)
        ContextCompat.startForegroundService(this, intent)
    }

    private fun stopWakeWordService() {
        stopService(Intent(this, WakeWordService::class.java))
    }

    override fun onResume() {
        super.onResume()
        // 실제 기기 로그로 확인된 원인: "마이크 사용" 타입 포그라운드 서비스가 실제로 녹음
        // 중이 아니어도, 떠 있는 것 자체가 같은 앱(UID)의 WebView 오디오 세션과 충돌해
        // getUserMedia가 NotReadableError로 실패했다. 내부 녹음만 껐다 켰다 하는 대신,
        // 화면에 떠 있는 동안은 서비스 자체를 완전히 종료해 충돌 여지를 없앤다.
        reportToServer("MainActivity.onResume: 웨이크워드 서비스 종료")
        stopWakeWordService()
        webView.onResume()
        // JS 타이머를 먼저 풀어준 뒤에 재개 신호를 보내야 콜백이 확실히 실행된다.
        webView.evaluateJavascript("window.__neurocareResume && window.__neurocareResume()", null)

        // 전체화면 알림은 잠금화면에서 사용자가 직접 탭하지 않고 자동으로 열리는 경우가
        // 대부분인데, setAutoCancel()은 탭했을 때만 지워져서 앱이 열려도 상단 알림바에
        // 계속 남아있는 문제가 있었다 - 앱이 실제로 뜬 시점에 확실히 지운다.
        NotificationManagerCompat.from(this).cancel(WakeWordService.WAKE_NOTIFICATION_ID)
    }

    override fun onPause() {
        super.onPause()
        reportToServer("MainActivity.onPause: 웹 대화엔진 정지 + 웨이크워드 서비스 시작")
        // 근본 원인: 액티비티가 onPause되어도 안드로이드가 WebView의 JS(마이크/VAD/TTS
        // 재생 큐)를 자동으로 멈춰주지 않는다. 그대로 두면 네이티브 웨이크워드 감시와 웹
        // 대화엔진이 동시에 마이크를 잡고 각자 다른 응답을 만들어 음성이 겹쳐 재생된다
        // (실사용 보고: "목소리가 2중으로 중첩되서 다른내용이랑 쓰여진내용두개가 동시에 출력").
        // JS 타이머가 멎기 전에 먼저 정지 신호를 보내 vad.stop()/오디오 큐 비우기가
        // 확실히 실행되게 한다.
        webView.evaluateJavascript("window.__neurocarePause && window.__neurocarePause()", null)
        webView.onPause()
        // 화면을 벗어나면 다시 백그라운드에서 이름 호출을 감시한다.
        startWakeWordService()
    }

    override fun onDestroy() {
        super.onDestroy()
        reportToServer("MainActivity.onDestroy: WebView 강제 파괴 + 웨이크워드 서비스 시작 보장")
        // onPause()가 웹 대화엔진 정지 신호를 보내지만 evaluateJavascript는 비동기다 -
        // 최근 앱 목록에서 스와이프로 앱을 완전히 닫을 때처럼 onPause 직후 onDestroy가
        // 빠르게 이어지면, 신호가 웹 쪽에서 실제로 실행되기 전에 액티비티가 사라져버릴
        // 수 있다. 게다가 onPause에서 이미 웨이크워드 서비스를 포그라운드로 띄워
        // 프로세스 자체는 안 죽는 상태라, 정지 신호를 놓친 WebView가 마이크/TTS/LLM
        // 스트리밍을 백그라운드에서 계속 붙잡고 있을 수 있다("앱을 꺼도 계속 대화를
        // 하는 경우가 있어" 실사용 보고) - JS의 협조적인 정지 신호에만 기대지 않고
        // WebView 자체를 여기서 확실히 파괴해 마이크/오디오/네트워크를 강제로 끊는다.
        webView.destroy()
        // onPause가 어떤 이유로든 못 불렸을 경우(화면 꺼짐이 onPause를 못 부르는
        // 것과 같은 종류의 플랫폼 엣지 케이스)를 대비해, 액티비티가 사라지는 시점에
        // 한 번 더 웨이크워드 서비스 시작을 보장한다 - 이미 떠 있으면 아무 효과 없는
        // 멱등 호출이다.
        startWakeWordService()
        unregisterReceiver(screenPowerReceiver)
    }

}
