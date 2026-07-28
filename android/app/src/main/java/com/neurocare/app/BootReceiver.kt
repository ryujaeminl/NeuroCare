package com.neurocare.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat
import com.neurocare.app.wakeword.WakeWordService

/** 재부팅 후에도 웨이크워드 서비스를 다시 띄운다 (마이크 권한이 이미 부여된 경우에만 의미 있음). */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            ContextCompat.startForegroundService(context, Intent(context, WakeWordService::class.java))
        }
    }
}
