package com.neurocare.app

import android.Manifest
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
    private val screenOffReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == Intent.ACTION_SCREEN_OFF) {
                reportToServer("ACTION_SCREEN_OFF: 웨이크워드 서비스 시작(onPause 보완)")
                startWakeWordService()
            }
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

        // 전체화면 알림은 잠금화면에서만 자동으로 앱을 띄운다 - 화면이 켜져 있고 다른 앱을
        // 쓰는 중이거나 홈화면일 땐 배너만 뜨고 자동으로 안 열린다(안드로이드가 의도적으로
        // 막아둔 동작). "다른 앱 위에 그리기" 권한이 있으면 WakeWordService가 짧게 오버레이
        // 창을 띄워 그 제약을 풀고 바로 앱을 띄울 수 있다.
        if (!Settings.canDrawOverlays(this)) {
            startActivity(
                Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")),
            )
        }

        // 태블릿을 탁자에 세워두고 쓰는 사용 방식이라, 화면이 꺼지면 마이크도 함께 멎는다.
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        registerReceiver(screenOffReceiver, IntentFilter(Intent.ACTION_SCREEN_OFF))

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

        // 전체화면 알림은 잠금화면에서 사용자가 직접 탭하지 않고 자동으로 열리는 경우가
        // 대부분인데, setAutoCancel()은 탭했을 때만 지워져서 앱이 열려도 상단 알림바에
        // 계속 남아있는 문제가 있었다 - 앱이 실제로 뜬 시점에 확실히 지운다.
        NotificationManagerCompat.from(this).cancel(WakeWordService.WAKE_NOTIFICATION_ID)
    }

    override fun onPause() {
        super.onPause()
        reportToServer("MainActivity.onPause: 웨이크워드 서비스 시작")
        // 화면을 벗어나면 다시 백그라운드에서 이름 호출을 감시한다.
        startWakeWordService()
    }

    override fun onDestroy() {
        super.onDestroy()
        unregisterReceiver(screenOffReceiver)
    }

}
