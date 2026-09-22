package com.min.journal

import android.Manifest
import android.app.*
import android.content.*
import android.content.pm.PackageManager
import android.net.Uri
import android.os.*
import android.provider.Settings
import android.webkit.*
import android.graphics.Color
import android.widget.FrameLayout
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : AppCompatActivity() {
    private lateinit var web: WebView
    private var pendingAuthUri: Uri? = null
    private val notifPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) {}
    private val mediaPermissions = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {}

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Android 15+ can enforce edge-to-edge on the window. The root may extend behind
        // system UI, but the WebView itself is physically laid out only inside Android's
        // runtime safe area. No fixed dp/px and no HTML padding are used.
        WindowCompat.setDecorFitsSystemWindows(window, false)
        pendingAuthUri = intent?.data?.takeIf { it.scheme == "diary" && it.host == "login" }

        val root = FrameLayout(this).apply {
            setBackgroundColor(Color.WHITE)
        }
        web = WebView(this)
        root.addView(web, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ))
        setContentView(root)

        ViewCompat.setOnApplyWindowInsetsListener(root) { _, insets ->
            val safe = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
            )
            val lp = web.layoutParams as FrameLayout.LayoutParams
            if (lp.leftMargin != safe.left || lp.topMargin != safe.top ||
                lp.rightMargin != safe.right || lp.bottomMargin != safe.bottom) {
                lp.setMargins(safe.left, safe.top, safe.right, safe.bottom)
                web.layoutParams = lp
            }
            insets
        }
        ViewCompat.requestApplyInsets(root)

        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.settings.allowFileAccess = true
        web.settings.allowContentAccess = true
        web.settings.mediaPlaybackRequiresUserGesture = false
        web.webChromeClient = WebChromeClient()
        web.webViewClient = object: WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url
                if (uri.scheme == "diary" && uri.host == "login") {
                    deliverAuthCallback(uri)
                    return true
                }
                return false
            }
            override fun onPageFinished(view: WebView, url: String) {
                super.onPageFinished(view, url)
                injectNativeAlarmBridge()
                pendingAuthUri?.let { deliverAuthCallback(it); pendingAuthUri = null }
            }
        }
        web.addJavascriptInterface(NativeAlarmBridge(this), "NativeAlarm")
        web.addJavascriptInterface(NativeAuthBridge(this), "NativeAuth")
        web.addJavascriptInterface(NativeUiBridge(this), "NativeUi")
        web.loadUrl("file:///android_asset/index.html")
        requestPowerfulRelevantPermissions()
        PersistentNotificationService.start(this)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        intent.data?.takeIf { it.scheme == "diary" && it.host == "login" }?.let { deliverAuthCallback(it) }
    }

    private fun deliverAuthCallback(uri: Uri) {
        val values = mutableMapOf<String,String>()
        uri.fragment?.split('&')?.forEach { part ->
            val a = part.split('=', limit=2); if(a.size==2) values[Uri.decode(a[0])] = Uri.decode(a[1])
        }
        uri.queryParameterNames.forEach { k -> uri.getQueryParameter(k)?.let { values[k]=it } }
        val access = values["access_token"] ?: ""
        val refresh = values["refresh_token"] ?: ""
        val code = values["code"] ?: ""
        val error = values["error_description"] ?: values["error"] ?: ""
        fun jsq(x:String) = org.json.JSONObject.quote(x)
        val js = """
            (()=>{
              const detail={access_token:${jsq(access)},refresh_token:${jsq(refresh)},code:${jsq(code)},error:${jsq(error)}};
              window.dispatchEvent(new CustomEvent('android-auth-callback',{detail}));
              document.querySelectorAll('iframe').forEach(f=>{try{f.contentWindow.dispatchEvent(new CustomEvent('android-auth-callback',{detail}))}catch(e){}});
            })();
        """.trimIndent()
        web.post { web.evaluateJavascript(js, null) }
    }

    private fun injectNativeAlarmBridge() {
        val js = """
        (()=>{if(window.__nativeAlarmHooked)return;window.__nativeAlarmHooked=true;
        const start=document.getElementById('alarmStart'),cancel=document.getElementById('alarmCancel'),stop=document.getElementById('alarmStop');
        start?.addEventListener('click',()=>{const h=Math.max(0,parseInt(document.getElementById('alarmHours')?.value||'0')||0);const m=Math.max(0,parseInt(document.getElementById('alarmMinutes')?.value||'0')||0);if(h*60+m>0)NativeAlarm.scheduleAfterMinutes(h*60+m)},true);
        cancel?.addEventListener('click',()=>NativeAlarm.cancel(),true);stop?.addEventListener('click',()=>NativeAlarm.cancel(),true)})();
        """.trimIndent()
        web.evaluateJavascript(js, null)
    }

    private fun requestPowerfulRelevantPermissions() {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) notifPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        if (Build.VERSION.SDK_INT >= 33) mediaPermissions.launch(arrayOf(Manifest.permission.READ_MEDIA_AUDIO, Manifest.permission.READ_MEDIA_IMAGES, Manifest.permission.READ_MEDIA_VIDEO))
        val nm=getSystemService(NotificationManager::class.java); if(!nm.isNotificationPolicyAccessGranted) runCatching{startActivity(Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS))}
        if(Build.VERSION.SDK_INT>=31){val am=getSystemService(AlarmManager::class.java);if(!am.canScheduleExactAlarms())runCatching{startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,Uri.parse("package:$packageName")))}}
        if(Build.VERSION.SDK_INT>=30&&!Environment.isExternalStorageManager())runCatching{startActivity(Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,Uri.parse("package:$packageName")))}
        val pm=getSystemService(PowerManager::class.java);if(!pm.isIgnoringBatteryOptimizations(packageName))runCatching{startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,Uri.parse("package:$packageName")))}
    }

    @Deprecated("Deprecated in Java") override fun onBackPressed(){if(web.canGoBack())web.goBack() else super.onBackPressed()}
}

class NativeAuthBridge(private val context: Context) {
    @JavascriptInterface fun openUrl(url: String) { runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } }
}
class NativeAlarmBridge(private val context: Context) {
    @JavascriptInterface fun scheduleAfterMinutes(minutes:Int)=AlarmScheduler.schedule(context,System.currentTimeMillis()+minutes.coerceAtLeast(1)*60_000L)
    @JavascriptInterface fun cancel()=AlarmScheduler.cancel(context)
}

class NativeUiBridge(private val context: Context) {
    @JavascriptInterface fun showToast(message: String) {
        Handler(Looper.getMainLooper()).post { android.widget.Toast.makeText(context, message, android.widget.Toast.LENGTH_SHORT).show() }
    }
}
