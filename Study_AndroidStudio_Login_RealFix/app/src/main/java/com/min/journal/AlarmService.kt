package com.min.journal

import android.app.*
import android.content.*
import android.media.*
import android.os.*
import android.provider.Settings
import androidx.core.app.NotificationCompat

class AlarmService: Service() {
    private var player: MediaPlayer?=null
    private var vibrator: Vibrator?=null
    private var wake: PowerManager.WakeLock?=null
    private val handler=Handler(Looper.getMainLooper())
    private val stopRunnable=Runnable{ stopSelf() }
    private var oldAlarmVolume:Int?=null
    private var oldRingerMode:Int?=null
    private var focusRequest:AudioFocusRequest?=null

    override fun onCreate(){ super.onCreate(); createChannel() }
    override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int {
        if(intent?.action=="STOP"){ stopSelf(); return START_NOT_STICKY }
        startForeground(77, notification())
        wake=(getSystemService(PowerManager::class.java)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP,"Journal:Alarm").apply{acquire(10*60*1000L+30_000L)}
        prepareAudio(); startSound(); startVibration(); launchAlarmScreen()
        handler.removeCallbacks(stopRunnable); handler.postDelayed(stopRunnable,10*60*1000L)
        return START_NOT_STICKY
    }
    private fun prepareAudio(){
        val a=getSystemService(AudioManager::class.java)
        oldAlarmVolume=a.getStreamVolume(AudioManager.STREAM_ALARM); oldRingerMode=a.ringerMode
        runCatching{a.ringerMode=AudioManager.RINGER_MODE_NORMAL}
        a.setStreamVolume(AudioManager.STREAM_ALARM,a.getStreamMaxVolume(AudioManager.STREAM_ALARM),0)
        val attrs=AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()
        if(Build.VERSION.SDK_INT>=26){
            focusRequest=AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE).setAudioAttributes(attrs).setOnAudioFocusChangeListener{}.build()
            runCatching{a.requestAudioFocus(focusRequest!!)}
        } else @Suppress("DEPRECATION") runCatching{a.requestAudioFocus(null,AudioManager.STREAM_ALARM,AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE)}
    }
    private fun startSound(){
        val uri=Settings.System.DEFAULT_ALARM_ALERT_URI ?: Settings.System.DEFAULT_RINGTONE_URI
        player=MediaPlayer().apply{setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());setDataSource(this@AlarmService,uri);isLooping=true;setVolume(1f,1f);prepare();start()}
    }
    private fun startVibration(){
        vibrator=if(Build.VERSION.SDK_INT>=31) getSystemService(VibratorManager::class.java).defaultVibrator else @Suppress("DEPRECATION") getSystemService(VIBRATOR_SERVICE) as Vibrator
        vibrator?.vibrate(VibrationEffect.createWaveform(longArrayOf(0,1000,250,1000,250,1500),intArrayOf(0,255,0,255,0,255),1),AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build())
    }
    private fun launchAlarmScreen(){runCatching{startActivity(Intent(this,AlarmActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP))}}
    private fun createChannel(){if(Build.VERSION.SDK_INT>=26){val nm=getSystemService(NotificationManager::class.java);val ch=NotificationChannel("alarm_urgent","강력 알람",NotificationManager.IMPORTANCE_HIGH).apply{description="종합 기록장 알람";lockscreenVisibility=Notification.VISIBILITY_PUBLIC;enableVibration(true);vibrationPattern=longArrayOf(0,1000,250,1000);setSound(Settings.System.DEFAULT_ALARM_ALERT_URI,AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build());if(nm.isNotificationPolicyAccessGranted)setBypassDnd(true)};nm.createNotificationChannel(ch)}}
    private fun notification():Notification{val full=PendingIntent.getActivity(this,0,Intent(this,AlarmActivity::class.java),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE);val stop=PendingIntent.getService(this,1,Intent(this,AlarmService::class.java).setAction("STOP"),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE);return NotificationCompat.Builder(this,"alarm_urgent").setSmallIcon(android.R.drawable.ic_lock_idle_alarm).setContentTitle("⏰ 종합 기록장 알람").setContentText("알람이 울리고 있습니다").setPriority(NotificationCompat.PRIORITY_MAX).setCategory(NotificationCompat.CATEGORY_ALARM).setOngoing(true).setFullScreenIntent(full,true).addAction(0,"끄기",stop).build()}
    override fun onDestroy(){
        handler.removeCallbacks(stopRunnable);runCatching{player?.stop()};player?.release();player=null;vibrator?.cancel();wake?.let{if(it.isHeld)it.release()}
        val a=getSystemService(AudioManager::class.java);oldAlarmVolume?.let{runCatching{a.setStreamVolume(AudioManager.STREAM_ALARM,it,0)}};oldRingerMode?.let{runCatching{a.ringerMode=it}}
        if(Build.VERSION.SDK_INT>=26)focusRequest?.let{runCatching{a.abandonAudioFocusRequest(it)}} else @Suppress("DEPRECATION") runCatching{a.abandonAudioFocus(null)}
        super.onDestroy()
    }
    override fun onBind(i:Intent?)=null
}
