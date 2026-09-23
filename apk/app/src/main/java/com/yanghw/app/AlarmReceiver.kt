package com.yanghw.app
import android.content.*
import androidx.core.content.ContextCompat
class AlarmReceiver: BroadcastReceiver(){ override fun onReceive(c:Context,i:Intent){ ContextCompat.startForegroundService(c,Intent(c,AlarmService::class.java)) } }
class BootReceiver: BroadcastReceiver(){ override fun onReceive(c:Context,i:Intent){ AlarmScheduler.restore(c); runCatching { PersistentNotificationService.start(c) } } }
