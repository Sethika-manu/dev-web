package com.royalcodex.browser.v1

import android.content.Intent
import android.net.Uri
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
import android.os.Vibrator
import android.os.VibrationEffect
import android.content.Context
import java.net.URLEncoder

class MainActivity : TauriActivity() {
    private var tauriWebView: WebView? = null
    var nativeWebView: WebView? = null

    @SuppressLint("SetJavaScriptEnabled", "ClickableViewAccessibility")
    override fun onWebViewCreate(webView: WebView) {
        super.onWebViewCreate(webView)
        tauriWebView = webView

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

                // 🚨 NATIVE OS-LEVEL LONG PRESS DETECTOR 🚨
                setOnLongClickListener {
                    val result = hitTestResult
                    val url = result.extra
                    val type = result.type

                    if (url != null) {
                        var payloadType = ""
                        
                        if (type == WebView.HitTestResult.IMAGE_TYPE || type == WebView.HitTestResult.SRC_IMAGE_ANCHOR_TYPE) {
                            payloadType = "image"
                        } else if (type == WebView.HitTestResult.SRC_ANCHOR_TYPE) {
                            payloadType = "link"
                        }

                        if (payloadType.isNotEmpty()) {
                            try {
                                val vibrator = context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
                                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                                    vibrator.vibrate(VibrationEffect.createOneShot(50, VibrationEffect.DEFAULT_AMPLITUDE))
                                } else {
                                    @Suppress("DEPRECATION")
                                    vibrator.vibrate(50)
                                }
                            } catch (e: Exception) {}

                            val escapedUrl = url.replace("'", "\\'").replace("\"", "\\\"")
                            tauriWebView?.post {
                                // 🚨 REACT WEBVIEW එක උඩට ගන්නවා POPUP එක පෙන්නන්න 🚨
                                tauriWebView?.bringToFront()
                                
                                val js = "window.dispatchEvent(new CustomEvent('rc-native-context-menu', { detail: { type: '$payloadType', url: '$escapedUrl' } }));"
                                tauriWebView?.evaluateJavascript(js, null)
                            }
                            
                            return@setOnLongClickListener true 
                        }
                    }
                    false 
                }
            }

            rootView.post {
                val density = resources.displayMetrics.density
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

        val bridge = AndroidBridge(nativeWebView)
        webView.addJavascriptInterface(bridge, "NativeBridge")
        webView.addJavascriptInterface(bridge, "AndroidBridge")
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
    
    // 🚨 React එකෙන් Menu එක Close කරාම ආපහු Google එක උඩට ගන්න Function එක 🚨
    @JavascriptInterface
    fun hideContextMenu() {
        Handler(Looper.getMainLooper()).post {
            nativeWebView?.bringToFront()
        }
    }

    @JavascriptInterface
    fun loadNativeUrl(url: String) {
        Handler(Looper.getMainLooper()).post {
            var targetUrl = url.trim()
            
            if (targetUrl.isEmpty() || targetUrl == "about:blank") {
                nativeWebView?.visibility = View.GONE
                nativeWebView?.loadUrl("about:blank")
            } else {
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