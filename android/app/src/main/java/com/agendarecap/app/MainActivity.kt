package com.agendarecap.app

import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
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
        private const val MAX_NETWORK_RETRIES = 3
        private const val MAIN_APP_URL = "https://agendarecap.vercel.app"
        private const val OFFLINE_FALLBACK_URL = "file:///android_asset/public/index.html"
    }

    private var networkRetryCount = 0
    private var isFallbackLoaded = false
    private val mainHandler = Handler(Looper.getMainLooper())

    override fun onCreate(savedInstanceState: Bundle?) {
        Log.d(TAG, "MainActivity created (Kotlin Engine)")
        registerPlugin(NativeAlarmPlugin::class.java)

        // Prevent restoring stale WebView error state on cold start
        super.onCreate(null)

        setupBackNavigation()

        val webView = bridge.webView
        if (webView != null) {
            Log.d(TAG, "Configuring WebView settings and network handling")
            configureWebView(webView)
        }

        // Perform initial network connectivity check before loading primary URL
        checkAndLoadInitialPage()
    }

    private fun configureWebView(webView: WebView) {
        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.allowFileAccess = true
        settings.allowContentAccess = true
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        settings.cacheMode = WebSettings.LOAD_DEFAULT

        webView.webViewClient = object : BridgeWebViewClient(this.bridge) {
            override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                super.onPageStarted(view, url, favicon)
                Log.d(TAG, "Page started loading: $url")
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                Log.d(TAG, "Page finished loading: $url")
                if (url != null && url.contains("agendarecap.vercel.app")) {
                    networkRetryCount = 0
                    isFallbackLoaded = false
                }
            }

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

            override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                super.onReceivedError(view, request, error)

                if (request != null && request.isForMainFrame) {
                    val failingUrl = request.url?.toString() ?: ""
                    val errorCode = error?.errorCode ?: 0
                    val description = error?.description ?: ""

                    Log.w(TAG, "Network error on main frame: code=$errorCode, desc=$description, url=$failingUrl")

                    if (!isFallbackLoaded && networkRetryCount < MAX_NETWORK_RETRIES) {
                        networkRetryCount++
                        val delayMs = networkRetryCount * 1500L
                        Log.i(TAG, "Retrying main app load (Attempt $networkRetryCount/$MAX_NETWORK_RETRIES) in ${delayMs}ms")

                        mainHandler.postDelayed({
                            if (view != null && isNetworkAvailable(this@MainActivity)) {
                                view.loadUrl(MAIN_APP_URL)
                            } else if (view != null) {
                                loadOfflineFallback(view)
                            }
                        }, delayMs)
                    } else if (!isFallbackLoaded) {
                        Log.e(TAG, "Network retries exhausted. Displaying custom offline fallback screen.")
                        if (view != null) {
                            loadOfflineFallback(view)
                        }
                    }
                }
            }
        }
    }

    private fun checkAndLoadInitialPage() {
        val webView = bridge.webView ?: return
        if (isNetworkAvailable(this)) {
            Log.i(TAG, "Network connected. Loading production domain: $MAIN_APP_URL")
            isFallbackLoaded = false
            webView.loadUrl(MAIN_APP_URL)
        } else {
            Log.w(TAG, "Device offline. Displaying custom offline HTML fallback.")
            loadOfflineFallback(webView)
        }
    }

    private fun loadOfflineFallback(webView: WebView) {
        isFallbackLoaded = true
        webView.loadUrl(OFFLINE_FALLBACK_URL)
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

    fun isNetworkAvailable(context: Context): Boolean {
        val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val network = connectivityManager.activeNetwork ?: return false
            val capabilities = connectivityManager.getNetworkCapabilities(network) ?: return false
            return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                   capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
        } else {
            @Suppress("DEPRECATION")
            val networkInfo = connectivityManager.activeNetworkInfo
            @Suppress("DEPRECATION")
            return networkInfo != null && networkInfo.isConnected
        }
    }

    override fun onResume() {
        super.onResume()
        Log.d(TAG, "Activity resumed")
        val webView = bridge.webView
        if (webView != null) {
            webView.onResume()
            webView.resumeTimers()

            // If offline fallback was previously displayed and network is restored, automatically reload main app
            if (isFallbackLoaded && isNetworkAvailable(this)) {
                Log.i(TAG, "Network restored on activity resume. Reloading live production application.")
                isFallbackLoaded = false
                webView.loadUrl(MAIN_APP_URL)
            }
        }
    }

    override fun onPause() {
        super.onPause()
        Log.d(TAG, "Activity paused")
        val webView = bridge.webView
        if (webView != null) {
            webView.onPause()
            webView.pauseTimers()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        Log.d(TAG, "Activity destroyed")
    }
}
