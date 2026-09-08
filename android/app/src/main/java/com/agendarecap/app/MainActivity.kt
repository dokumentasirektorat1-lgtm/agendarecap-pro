package com.agendarecap.app

import android.content.Context
import android.content.SharedPreferences
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import com.getcapacitor.BridgeActivity
import com.getcapacitor.BridgeWebViewClient

class MainActivity : BridgeActivity() {

    companion object {
        private const val TAG = "[AgendaRecap][Lifecycle]"
        private const val PREFS_NAME = "agendarecap_lifecycle_prefs"
        private const val KEY_CRASH_COUNT = "renderer_crash_count"
        private const val KEY_LAST_CRASH_TIME = "last_crash_time_ms"
    }

    private val mainHandler = Handler(Looper.getMainLooper())

    override fun onCreate(savedInstanceState: Bundle?) {
        Log.d(TAG, "MainActivity created (Native Local Bundle Engine)")
        registerPlugin(NativeAlarmPlugin::class.java)

        super.onCreate(savedInstanceState)

        setupBackNavigation()

        val webView = bridge.webView
        if (webView != null) {
            configureWebView(webView)
        }
    }

    private fun configureWebView(webView: WebView) {
        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.allowFileAccess = true
        settings.allowContentAccess = true

        webView.webViewClient = object : BridgeWebViewClient(this.bridge) {
            override fun onRenderProcessGone(view: WebView?, detail: RenderProcessGoneDetail?): Boolean {
                Log.e(TAG, "WebView renderer process gone. Did crash: ${detail?.didCrash()}")

                try {
                    view?.destroy()
                } catch (ignored: Exception) {}

                val prefs: SharedPreferences = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                val now = System.currentTimeMillis()
                val lastCrashTime = prefs.getLong(KEY_LAST_CRASH_TIME, 0)
                var crashCount = prefs.getInt(KEY_CRASH_COUNT, 0)

                if (now - lastCrashTime > 60000) {
                    crashCount = 0
                }

                crashCount++
                prefs.edit()
                    .putInt(KEY_CRASH_COUNT, crashCount)
                    .putLong(KEY_LAST_CRASH_TIME, now)
                    .apply()

                if (crashCount <= 3) {
                    Log.w(TAG, "Recovery attempt $crashCount: Restarting activity...")
                    mainHandler.postDelayed({
                        try {
                            val intent = intent
                            finish()
                            startActivity(intent)
                        } catch (e: Exception) {
                            Log.e(TAG, "Failed to restart activity", e)
                        }
                    }, 1000)
                    return true
                }

                return super.onRenderProcessGone(view, detail)
            }
        }
    }

    private fun setupBackNavigation() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                val webView = bridge.webView
                if (webView != null && webView.canGoBack()) {
                    Log.d(TAG, "Back button pressed -> Navigating back in WebView history")
                    webView.goBack()
                } else {
                    Log.d(TAG, "Back button pressed -> WebView cannot go back, exiting Activity")
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })
    }
}
