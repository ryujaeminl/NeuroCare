package com.neurocare.guardian.emergency

import android.app.KeyguardManager
import android.os.Build
import android.os.Bundle
import android.webkit.WebView
import androidx.activity.ComponentActivity
import com.neurocare.guardian.BuildConfig

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
        webView.loadUrl("${BuildConfig.WEBAPP_BASE_URL}/emergency/$eventId")
    }

    companion object {
        const val EXTRA_EVENT_ID = "eventId"
    }
}
