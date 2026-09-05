package com.agendarecap.app;

import android.content.Intent;
import android.os.Bundle;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {
    private int rendererCrashCount = 0;
    private static final int MAX_RENDERER_CRASH_RETRIES = 3;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeAlarmPlugin.class);
        super.onCreate(savedInstanceState);

        WebView webView = this.bridge.getWebView();
        if (webView != null) {
            WebSettings settings = webView.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setAllowFileAccess(true);
            settings.setAllowContentAccess(true);
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
            settings.setCacheMode(WebSettings.LOAD_DEFAULT);

            // Configure WebViewClient for renderer crash recovery & network error fallback
            webView.setWebViewClient(new BridgeWebViewClient(this.bridge) {
                @Override
                public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                    if (view != null) {
                        view.destroy();
                    }
                    if (rendererCrashCount < MAX_RENDERER_CRASH_RETRIES) {
                        rendererCrashCount++;
                        Intent intent = getIntent();
                        finish();
                        startActivity(intent);
                        return true;
                    }
                    return super.onRenderProcessGone(view, detail);
                }

                @Override
                public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                    super.onReceivedError(view, request, error);
                    if (request != null && request.isForMainFrame()) {
                        if (view != null) {
                            view.loadUrl("file:///android_asset/public/index.html");
                        }
                    }
                }
            });
        }
    }
}
