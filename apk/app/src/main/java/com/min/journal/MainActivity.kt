package com.min.journal

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
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.browser.customtabs.CustomTabsIntent

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
        pendingAuthUri = intent?.data?.takeIf { it.scheme == "yangstudy" && it.host == "auth" && it.path == "/callback" }

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
                if (uri.scheme == "yangstudy" && uri.host == "auth" && uri.path == "/callback") {
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
        web.addJavascriptInterface(AndroidAuthBridge(this) { notifyOpenUrlFailed() }, "AndroidAuth")
        web.addJavascriptInterface(NativeUiBridge(this), "NativeUi")
        web.loadUrl("file:///android_asset/index.html")
        requestPowerfulRelevantPermissions()
        PersistentNotificationService.start(this)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        intent.data?.takeIf { it.scheme == "yangstudy" && it.host == "auth" && it.path == "/callback" }?.let { deliverAuthCallback(it) }
    }

    private fun deliverAuthCallback(uri: Uri) {
        // IMPORTANT: Supabase PKCE stores the code verifier in the WebView/frame that
        // started OAuth. Returning the code only to the top index page can therefore
        // show a cached account label while leaving the real child-page session empty.
        // Route the full callback URL back to the exact frame that initiated OAuth.
        val callbackUrl = org.json.JSONObject.quote(uri.toString())
        val js = """
        (function(){
          const callbackUrl=$callbackUrl;
          const source=window.__androidOAuthSource||'index.html';
          if(source==='index.html'){
            if(typeof window.yangStudyHandleOAuthCallback==='function'){
              window.yangStudyHandleOAuthCallback(callbackUrl);
            }
            return;
          }
          const frames=[...document.querySelectorAll('iframe')];
          const target=frames.find(f=>{
            const src=(f.getAttribute('src')||f.getAttribute('data-src')||'').split('?')[0];
            return src.endsWith(source);
          });
          if(target?.contentWindow && typeof target.contentWindow.yangStudyHandleOAuthCallback==='function'){
            target.contentWindow.yangStudyHandleOAuthCallback(callbackUrl);
          } else {
            // If a lazy iframe was replaced/reloaded, try every loaded child without
            // consuming the code in the top page first.
            for(const f of frames){
              try{
                if(typeof f.contentWindow?.yangStudyHandleOAuthCallback==='function'){
                  f.contentWindow.yangStudyHandleOAuthCallback(callbackUrl);
                  break;
                }
              }catch(_e){}
            }
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
