package com.agendarecap.app;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "[AgendaRecap][Lifecycle]";
    private static final String PREFS_NAME = "agendarecap_lifecycle_prefs";
    private static final String KEY_CRASH_COUNT = "renderer_crash_count";
    private static final String KEY_LAST_CRASH_TIME = "last_crash_time_ms";
    private static final int MAX_NETWORK_RETRIES = 3;
    private static final String MAIN_APP_URL = "https://agendarecap.vercel.app";

    private int networkRetryCount = 0;
    private boolean isFallbackLoaded = false;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    @Override
    public void onCreate(Bundle savedInstanceState) {
        Log.d(TAG, "Application & Activity created (Cold Start)");
        registerPlugin(NativeAlarmPlugin.class);

        // Do not restore stale WebView error state from savedInstanceState after force close
        super.onCreate(null);

        WebView webView = this.bridge.getWebView();
        if (webView != null) {
            Log.d(TAG, "WebView created and configuring settings");
            WebSettings settings = webView.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setAllowFileAccess(true);
            settings.setAllowContentAccess(true);
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
            settings.setCacheMode(WebSettings.LOAD_DEFAULT);

            webView.setWebViewClient(new BridgeWebViewClient(this.bridge) {
                @Override
                public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                    super.onPageStarted(view, url, favicon);
                    Log.d(TAG, "Loading URL: " + url);
                }

                @Override
                public void onPageFinished(WebView view, String url) {
                    super.onPageFinished(view, url);
                    Log.d(TAG, "Page finished loading: " + url);
                    if (url != null && url.contains("agendarecap.vercel.app")) {
                        networkRetryCount = 0;
                        isFallbackLoaded = false;
                    }
                }

                @Override
                public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                    Log.e(TAG, "Renderer terminated (onRenderProcessGone). Did crash: " + detail.didCrash());

                    if (view != null) {
                        try {
                            view.destroy();
                        } catch (Exception ignored) {}
                    }

                    SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                    long now = System.currentTimeMillis();
                    long lastCrashTime = prefs.getLong(KEY_LAST_CRASH_TIME, 0);
                    int crashCount = prefs.getInt(KEY_CRASH_COUNT, 0);

                    // Reset count if last crash was more than 60 seconds ago
                    if (now - lastCrashTime > 60000) {
                        crashCount = 0;
                    }

                    crashCount++;
                    prefs.edit()
                            .putInt(KEY_CRASH_COUNT, crashCount)
                            .putLong(KEY_LAST_CRASH_TIME, now)
                            .apply();

                    if (crashCount <= 3) {
                        Log.w(TAG, "WebView recovery started. Recreating activity attempt " + crashCount);
                        mainHandler.postDelayed(() -> {
                            try {
                                Intent intent = getIntent();
                                finish();
                                startActivity(intent);
                            } catch (Exception e) {
                                Log.e(TAG, "Failed to restart activity after renderer crash", e);
                            }
                        }, 1000);
                        return true;
                    }

                    Log.e(TAG, "Max renderer crash retries exceeded. Delegating to super.");
                    return super.onRenderProcessGone(view, detail);
                }

                @Override
                public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                    super.onReceivedError(view, request, error);
                    if (request != null && request.isForMainFrame()) {
                        String failingUrl = request.getUrl() != null ? request.getUrl().toString() : "";
                        int errorCode = error != null ? error.getErrorCode() : 0;
                        CharSequence description = error != null ? error.getDescription() : "";

                        Log.w(TAG, "Network error on main frame: code=" + errorCode + ", desc=" + description + ", url=" + failingUrl);

                        // If error happens while loading primary domain and not already fallback
                        if (!isFallbackLoaded && networkRetryCount < MAX_NETWORK_RETRIES) {
                            networkRetryCount++;
                            long delayMs = networkRetryCount * 1500L;
                            Log.i(TAG, "Retrying main app load (Attempt " + networkRetryCount + "/" + MAX_NETWORK_RETRIES + ") in " + delayMs + "ms");

                            mainHandler.postDelayed(() -> {
                                if (view != null) {
                                    view.loadUrl(MAIN_APP_URL);
                                }
                            }, delayMs);
                        } else if (!isFallbackLoaded && networkRetryCount >= MAX_NETWORK_RETRIES) {
                            Log.e(TAG, "Network error retries exhausted. Loading local offline shell fallback.");
                            isFallbackLoaded = true;
                            if (view != null) {
                                view.loadUrl("file:///android_asset/public/index.html");
                            }
                        }
                    }
                }
            });
        }
    }

    @Override
    public void onStart() {
        super.onStart();
        Log.d(TAG, "Activity started");
    }

    @Override
    public void onResume() {
        super.onResume();
        Log.d(TAG, "Activity resumed");
    }

    @Override
    public void onPause() {
        super.onPause();
        Log.d(TAG, "Activity paused");
    }

    @Override
    public void onStop() {
        super.onStop();
        Log.d(TAG, "Activity stopped");
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        Log.d(TAG, "Activity destroyed");
    }
}

