package com.neurocare.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
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
import androidx.core.content.ContextCompat
import com.neurocare.app.emergency.EmergencyNotifier
import com.neurocare.app.wakeword.WakeWordService

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

    private val requestPermissions =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
            // 결과와 상관없이 마이크 권한 요청은 WebView의 onPermissionRequest에서 다시 확인한다.
            startWakeWordService()
            webView.loadUrl(BuildConfig.WEBAPP_BASE_URL)
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 이 앱은 환자용 웨이크워드 래퍼지만, 긴급 알림 채널은 앱 시작 시 한 번만 등록하면
        // 되고 만들어 두어도 해가 없어서 여기서 같이 준비한다 - 실제 알림 발송은 보호자 쪽에서
        // 일어난다 (EmergencyNotifier 문서 참고).
        EmergencyNotifier.createChannel(this)

        // 태블릿을 탁자에 세워두고 쓰는 사용 방식이라, 화면이 꺼지면 마이크도 함께 멎는다.
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        webView = WebView(this)
        setContentView(webView)
        setupWebView()

        // WebView가 오래되면 최신 JS 문법을 파싱하지 못해 화면만 그려지고 아무 동작도 하지 않는다.
        // 진단에 필요한 정보라 시작 시 한 번 남긴다.
        Log.i(TAG, "WebView 버전: ${WebViewCompat.getCurrentWebViewPackage(this)?.versionName ?: "알 수 없음"}")

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
        }

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
                if (request?.isForMainFrame == true) showError(detail)
            }

            override fun onReceivedHttpError(
                view: WebView?,
                request: WebResourceRequest?,
                errorResponse: WebResourceResponse?,
            ) {
                Log.e(TAG, "HTTP ${errorResponse?.statusCode} ${request?.url}")
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
                val hasMicPermission = ContextCompat.checkSelfPermission(
                    this@MainActivity,
                    Manifest.permission.RECORD_AUDIO,
                ) == PackageManager.PERMISSION_GRANTED

                if (wantsMic && hasMicPermission) {
                    request.grant(request.resources)
                } else {
                    request.deny()
                }
            }
        }
    }

    /** 같은 오류가 연달아 쏟아지면 토스트가 도배되므로 처음 것만 보여준다. */
    private var lastShownError: String? = null

    private fun showError(detail: String) {
        if (detail == lastShownError) return
        lastShownError = detail
        runOnUiThread { Toast.makeText(this, detail.take(300), Toast.LENGTH_LONG).show() }
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
            startWakeWordService()
            webView.loadUrl(BuildConfig.WEBAPP_BASE_URL)
        } else {
            requestPermissions.launch(missing.toTypedArray())
        }
    }

    private fun startWakeWordService() {
        val intent = Intent(this, WakeWordService::class.java)
        ContextCompat.startForegroundService(this, intent)
    }

    override fun onResume() {
        super.onResume()
        // 앱이 화면에 떠 있는 동안은 WebView(웹앱)가 마이크를 쓰므로, 백그라운드 서비스는
        // 듣기를 멈춰서 마이크 자원 충돌을 피한다.
        WakeWordService.isAppInForeground = true
    }

    override fun onPause() {
        super.onPause()
        // 화면을 벗어나면 다시 백그라운드에서 이름 호출을 감시한다.
        WakeWordService.isAppInForeground = false
    }

}
