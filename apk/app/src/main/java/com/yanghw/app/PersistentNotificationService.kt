package com.yanghw.app

import android.app.*
import android.content.*
import android.os.*
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

class PersistentNotificationService : Service() {
    companion object {
        const val CHANNEL_ID = "study_persistent"
        const val NOTIFICATION_ID = 41
        fun start(context: Context) {
            ContextCompat.startForegroundService(context, Intent(context, PersistentNotificationService::class.java))
        }
    }

    private val handler = Handler(Looper.getMainLooper())
    private val watchdog = object : Runnable {
        override fun run() {
            ensureNotification()
            handler.postDelayed(this, 5000L)
        }
    }

    override fun onCreate() {
        super.onCreate()
        createChannel()
        startForeground(NOTIFICATION_ID, buildNotification())
        handler.postDelayed(watchdog, 5000L)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        ensureNotification()
        return START_STICKY
    }

    private fun ensureNotification() {
        if (Build.VERSION.SDK_INT >= 23) {
            val nm = getSystemService(NotificationManager::class.java)
            val exists = nm.activeNotifications.any { it.id == NOTIFICATION_ID }
            if (!exists) nm.notify(NOTIFICATION_ID, buildNotification())
        } else {
            getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, buildNotification())
        }
    }

    private fun buildNotification(): Notification {
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val deleted = PendingIntent.getBroadcast(
            this, 0, Intent(this, PersistentNotificationReceiver::class.java).setAction("RESTORE_PERSISTENT_NOTIFICATION"),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_info_details)
            .setContentTitle("Study")
            .setContentText("Study가 실행 중입니다")
            .setContentIntent(open)
            .setDeleteIntent(deleted)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            val channel = NotificationChannel(CHANNEL_ID, "Study 상시 알림", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Study 앱의 상시 실행 알림"
                setSound(null, null)
                enableVibration(false)
                setShowBadge(false)
            }
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    override fun onDestroy() {
        handler.removeCallbacks(watchdog)
        super.onDestroy()
    }

    override fun onBind(intent: Intent?) = null
}

class PersistentNotificationReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        Handler(Looper.getMainLooper()).postDelayed({
            runCatching { PersistentNotificationService.start(context) }
        }, 5000L)
    }
}
