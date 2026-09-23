package com.yanghw.app

import android.Manifest
import android.app.*
import android.content.*
import android.content.pm.PackageManager
import android.net.Uri
import android.os.*
import android.provider.Settings
import android.util.Log
import android.webkit.*
import android.graphics.Color
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.browser.customtabs.CustomTabsIntent
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat

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
        pendingAuthUri = intent?.data?.takeIf { isOAuthCallback(it) }

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
        web.settings.allowFileAccess = false
        web.settings.allowContentAccess = false
        web.settings.mediaPlaybackRequiresUserGesture = false
        web.webChromeClient = WebChromeClient()

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        web.webViewClient = object : WebViewClientCompat() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                return assetLoader.shouldInterceptRequest(request.url)
            }

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url
                if (isOAuthCallback(uri)) {
                    deliverAuthCallback(uri)
                    return true
                }
                return false
            }

            override fun onPageFinished(view: WebView, url: String) {
                super.onPageFinished(view, url)
                injectNativeAlarmBridge()
                pendingAuthUri?.let {
                    deliverAuthCallback(it)
                    pendingAuthUri = null
                }
            }
        }
        web.addJavascriptInterface(NativeAlarmBridge(this), "NativeAlarm")
        web.addJavascriptInterface(AndroidAuthBridge(this) { notifyOpenUrlFailed() }, "AndroidAuth")
        web.addJavascriptInterface(NativeUiBridge(this), "NativeUi")
        web.loadUrl("https://appassets.androidplatform.net/assets/index.html")
        requestPowerfulRelevantPermissions()
        PersistentNotificationService.start(this)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        intent.data?.takeIf { isOAuthCallback(it) }?.let { deliverAuthCallback(it) }
    }

    private fun isOAuthCallback(uri: Uri): Boolean {
        if (uri.scheme != "yangstudy" || uri.host != "auth" || uri.path != "/callback") return false
        val fragment = uri.fragment ?: ""
        return !uri.getQueryParameter("code").isNullOrBlank() ||
            !uri.getQueryParameter("error").isNullOrBlank() ||
            !uri.getQueryParameter("error_description").isNullOrBlank() ||
            fragment.contains("access_token=") ||
            fragment.contains("error=")
    }

    private fun deliverAuthCallback(uri: Uri) {
        Toast.makeText(this, "OAuth 진단 ③: 앱이 콜백을 받았습니다", Toast.LENGTH_LONG).show()
        val callbackUrl = org.json.JSONObject.quote(uri.toString())
        val js = """
        (function(){
          const callbackUrl=$callbackUrl;
          if(typeof window.yangStudyOAuthDiag==='function'){ window.yangStudyOAuthDiag('③ 앱에서 WebView로 콜백 전달됨'); }
          if(typeof window.yangStudyHandleOAuthCallback==='function'){
            window.yangStudyHandleOAuthCallback(callbackUrl);
            return;
          }
          for(const f of document.querySelectorAll('iframe')){
            try{
              if(typeof f.contentWindow?.yangStudyHandleOAuthCallback==='function'){
                f.contentWindow.yangStudyHandleOAuthCallback(callbackUrl);
                return;
              }
            }catch(_e){}
          }
        })();
        """.trimIndent()
        web.post { web.evaluateJavascript(js, null) }
    }

    // Called when AndroidAuth.openOAuth could not open any browser at all (Custom
    // Tabs AND the plain ACTION_VIEW fallback both failed). This always targets the
    // top page, regardless of which tab/frame the Google button was pressed from,
    // so the failure is never silently swallowed - the user always sees an alert.
    private fun notifyOpenUrlFailed() {
        web.post {
            web.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('android-auth-open-failed'));", null
            )
        }
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

class AndroidAuthBridge(private val activity: Activity, private val onOpenFailed: () -> Unit) {
    @JavascriptInterface fun openOAuth(url: String): Boolean {
        val uri = runCatching { Uri.parse(url) }.getOrNull() ?: return false
        if (uri.scheme != "https" && uri.scheme != "http") return false
        Handler(Looper.getMainLooper()).post {
            val customTabsOk = runCatching {
                // Google OAuth must run in a real browser, never inside the WebView.
                CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(activity, uri)
                true
            }.getOrElse { e ->
                Log.w("AndroidAuthBridge", "Custom Tabs launch failed", e)
                false
            }
            val opened = customTabsOk || runCatching {
                activity.startActivity(Intent(Intent.ACTION_VIEW, uri).apply {
                    addCategory(Intent.CATEGORY_BROWSABLE)
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                })
                true
            }.getOrElse { e ->
                Log.w("AndroidAuthBridge", "ACTION_VIEW browser launch failed", e)
                false
            }
            if (!opened) {
                android.widget.Toast.makeText(activity, "Google 로그인 화면을 열지 못했습니다.", android.widget.Toast.LENGTH_LONG).show()
                onOpenFailed()
            }
        }
        return true
    }
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
