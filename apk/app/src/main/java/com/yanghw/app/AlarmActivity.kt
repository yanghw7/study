package com.yanghw.app
import android.app.*
import android.content.*
import android.graphics.Color
import android.os.*
import android.view.*
import android.widget.*

class AlarmActivity: Activity(){
 override fun onCreate(b:Bundle?){super.onCreate(b); if(Build.VERSION.SDK_INT>=27){setShowWhenLocked(true);setTurnScreenOn(true)} else @Suppress("DEPRECATION") window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON); window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD)
  val box=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;gravity=Gravity.CENTER;setPadding(40,40,40,40);setBackgroundColor(Color.rgb(40,95,80))}
  box.addView(TextView(this).apply{text="⏰\n알람";textSize=42f;gravity=Gravity.CENTER;setTextColor(Color.WHITE)})
  box.addView(Button(this).apply{text="알람 끄기";textSize=22f;setOnClickListener{stopService(Intent(this@AlarmActivity,AlarmService::class.java));AlarmScheduler.cancel(this@AlarmActivity);finish()}} ,LinearLayout.LayoutParams(-1,180).apply{setMargins(20,70,20,20)})
  setContentView(box)
 }
}
