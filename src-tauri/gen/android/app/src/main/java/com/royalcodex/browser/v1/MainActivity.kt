package com.royalcodex.browser.v1

import android.annotation.SuppressLint
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebChromeClient
import android.widget.FrameLayout
import android.graphics.Color
import java.net.URLEncoder

class MainActivity : TauriActivity() {
    private var tauriWebView: WebView? = null
    var nativeWebView: WebView? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onWebViewCreate(webView: WebView) {
        super.onWebViewCreate(webView)
        tauriWebView = webView

        // Singleton WebView Configuration
        if (nativeWebView == null) {
            val rootView = findViewById<FrameLayout>(android.R.id.content)

            nativeWebView = WebView(this).apply {
                setBackgroundColor(Color.WHITE)
                visibility = View.GONE 

                settings.apply {
                    javaScriptEnabled = true
                    domStorageEnabled = true
                    useWideViewPort = true
                    loadWithOverviewMode = true
                    setSupportZoom(true)
                    builtInZoomControls = true
                    displayZoomControls = false
                }

                webChromeClient = WebChromeClient()
                webViewClient = object : WebViewClient() {
                    override fun doUpdateVisitedHistory(view: WebView?, url: String?, isReload: Boolean) {
                        super.doUpdateVisitedHistory(view, url, isReload)
                        url?.let { syncUrlToReact(it) }
                    }
                    override fun onPageFinished(view: WebView?, url: String?) {
                        super.onPageFinished(view, url)
                        url?.let { syncUrlToReact(it) }
                    }
                }
            }

            // Tauri එක උගේ UI එක හදලා ඉවර වුණාට පස්සේ අපි අපේ එක ඔබනවා (post)
            rootView.post {
                val density = resources.displayMetrics.density
                
                // React UI එකේ උඩ Bar එකටයි යට Bar එකටයි ඉඩ තියනවා (85dp ගානේ)
                val topMarginPx = (100 * density).toInt() 
                val bottomMarginPx = (110 * density).toInt()

                val params = FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.MATCH_PARENT
                ).apply {
                    topMargin = topMarginPx
                    bottomMargin = bottomMarginPx
                }
                
                rootView.addView(nativeWebView, params)
            }
        } else {
            nativeWebView?.setBackgroundColor(Color.WHITE)
        }

        webView.addJavascriptInterface(AndroidBridge(nativeWebView), "NativeBridge")
        webView.addJavascriptInterface(AndroidBridge(nativeWebView), "AndroidBridge")
    }

    private fun syncUrlToReact(url: String) {
        val escapedUrl = url.replace("'", "\\'")
        tauriWebView?.post {
            tauriWebView?.evaluateJavascript(
                "if (window.onNativeUrlChanged) { window.onNativeUrlChanged('$escapedUrl'); }",
                null
            )
        }
    }
}

class AndroidBridge(private val nativeWebView: WebView?) {
    
    @JavascriptInterface
    fun loadNativeUrl(url: String) {
        Handler(Looper.getMainLooper()).post {
            var targetUrl = url.trim()
            
            if (targetUrl.isEmpty() || targetUrl == "about:blank") {
                nativeWebView?.visibility = View.GONE
                nativeWebView?.loadUrl("about:blank")
            } else {
                // සයිට් එකක් ආවම පේන්න දාලා, බලෙන්ම ලේයර්ස් වලින් උඩටම ගන්නවා!
                nativeWebView?.visibility = View.VISIBLE
                nativeWebView?.bringToFront() 
                
                val isUrl = targetUrl.contains(".") && !targetUrl.contains(" ")
                if (!targetUrl.startsWith("http") && isUrl) {
                    targetUrl = "https://$targetUrl"
                }
                if (!isUrl) {
                    try {
                        targetUrl = "https://www.google.com/search?q=${URLEncoder.encode(targetUrl, "UTF-8")}"
                    } catch (e: Exception) { }
                }
                nativeWebView?.loadUrl(targetUrl)
            }
        }
    }

    @JavascriptInterface
    fun goBack() {
        Handler(Looper.getMainLooper()).post {
            if (nativeWebView?.canGoBack() == true) {
                nativeWebView.goBack()
            }
        }
    }

    @JavascriptInterface
    fun goForward() {
        Handler(Looper.getMainLooper()).post {
            if (nativeWebView?.canGoForward() == true) {
                nativeWebView.goForward()
            }
        }
    }

    @JavascriptInterface
    fun reload() {
        Handler(Looper.getMainLooper()).post {
            nativeWebView?.reload()
        }
    }
}