package com.neurocare.app.emergency

import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/**
 * 긴급 상황을 잠금화면 위로 즉시 띄우는 전체화면 알림. Android 14(UPSIDE_DOWN_CAKE)부터는
 * 통화/알람 앱이 아니면 이 권한이 기본 꺼짐 상태라, [ensureFullScreenIntentPermission]으로
 * 사용자 동의를 받아 설정 화면으로 보내야 한다 - 스토어 심사는 필요 없다.
 *
 * 서버의 긴급 이벤트(app/api/emergency)를 이 함수 호출까지 실제로 이어주려면
 * FCM(Firebase Cloud Messaging) 연동이 필요하다. google-services.json(팀 고유 Firebase
 * 프로젝트 자격증명)이 있어야 하는 부분이라 이 저장소에는 포함하지 않았다 - FCM 서비스의
 * onMessageReceived에서 [showEmergencyAlert]를 호출하면 된다.
 */
object EmergencyNotifier {
    private const val CHANNEL_ID = "emergency_channel"

    fun createChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            "긴급 알림",
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "환자 위급 상황 알림"
            enableVibration(true)
            setBypassDnd(true)
        }
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    fun canUseFullScreenIntent(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return true
        return context.getSystemService(NotificationManager::class.java).canUseFullScreenIntent()
    }

    /** 권한이 없으면 시스템의 "전체 화면 알림 관리" 화면으로 보낸다. 호출 전에 사용자에게 이유를 설명해야 한다. */
    fun ensureFullScreenIntentPermission(activity: Activity) {
        if (canUseFullScreenIntent(activity)) return
        activity.startActivity(
            Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT).apply {
                data = Uri.parse("package:${activity.packageName}")
            },
        )
    }

    fun showEmergencyAlert(context: Context, eventId: String, title: String, body: String) {
        val fullScreenIntent = Intent(context, EmergencyAlertActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            putExtra(EmergencyAlertActivity.EXTRA_EVENT_ID, eventId)
        }
        val fullScreenPendingIntent = PendingIntent.getActivity(
            context,
            eventId.hashCode(),
            fullScreenIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setFullScreenIntent(fullScreenPendingIntent, true)
            .setAutoCancel(true)
            .build()

        NotificationManagerCompat.from(context).notify(eventId.hashCode(), notification)
    }
}
