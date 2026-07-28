package com.neurocare.app.emergency

import android.app.KeyguardManager
import android.os.Build
import android.os.Bundle
import android.webkit.WebView
import androidx.activity.ComponentActivity
import com.neurocare.app.BuildConfig

/**
 * 긴급 알림의 전체화면 인텐트가 열 때 잠금화면 위로 뜨는 화면.
 * 별도 네이티브 UI를 새로 만들지 않고, 이미 만들어진 보호자 웹앱의 확인 화면
 * (/guardian/emergency/[eventId])을 WebView로 그대로 띄운다 - MainActivity와 같은 방식이다.
 */
class EmergencyAlertActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setShowWhenLocked(true)
        setTurnScreenOn(true)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getSystemService(KeyguardManager::class.java)?.requestDismissKeyguard(this, null)
        }

        val eventId = intent.getStringExtra(EXTRA_EVENT_ID)
        val webView = WebView(this).apply { settings.javaScriptEnabled = true }
        setContentView(webView)
        webView.loadUrl("${BuildConfig.WEBAPP_BASE_URL}/guardian/emergency/$eventId")
    }

    companion object {
        const val EXTRA_EVENT_ID = "eventId"
    }
}
