package com.min.journal

import android.app.*
import android.content.*
import android.os.Build

object AlarmScheduler {
    private const val REQ=9107
    private const val PREF="native_alarm"
    fun pending(context: Context): PendingIntent = PendingIntent.getBroadcast(context, REQ, Intent(context, AlarmReceiver::class.java).setAction("RING"), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    fun schedule(context: Context, at: Long) {
        val am=context.getSystemService(AlarmManager::class.java)
        context.getSharedPreferences(PREF,0).edit().putLong("at",at).apply()
        val pi=pending(context)
        if(Build.VERSION.SDK_INT>=31 && !am.canScheduleExactAlarms()) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,at,pi)
        else am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,at,pi)
    }
    fun cancel(context: Context) {
        context.getSystemService(AlarmManager::class.java).cancel(pending(context))
        context.getSharedPreferences(PREF,0).edit().remove("at").apply()
        context.stopService(Intent(context,AlarmService::class.java))
    }
    fun restore(context: Context) {
        val at=context.getSharedPreferences(PREF,0).getLong("at",0L)
        if(at>System.currentTimeMillis()) schedule(context,at)
    }
}
