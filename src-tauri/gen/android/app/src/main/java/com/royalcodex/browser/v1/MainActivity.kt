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
import android.app.DownloadManager
import android.os.Environment
import android.util.Base64
import android.content.ContentValues
import android.provider.MediaStore

class MainActivity : TauriActivity() {
    private var tauriWebView: WebView? = null
    var nativeWebView: WebView? = null
    private var customView: View? = null
    private var customViewCallback: WebChromeClient.CustomViewCallback? = null

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

                webChromeClient = object : WebChromeClient() {
                    override fun onShowCustomView(view: View?, callback: CustomViewCallback?) {
                        super.onShowCustomView(view, callback)
                        if (customView != null) {
                            callback?.onCustomViewHidden()
                            return
                        }
                        
                        customView = view
                        customViewCallback = callback
                        
                        // Hide standard UI/WebView
                        this@apply.visibility = View.GONE
                        
                        // Add custom view to root view
                        val decor = window.decorView as FrameLayout
                        decor.addView(view, FrameLayout.LayoutParams(
                            FrameLayout.LayoutParams.MATCH_PARENT,
                            FrameLayout.LayoutParams.MATCH_PARENT
                        ))
                        
                        // Set immersive fullscreen flags
                        @Suppress("DEPRECATION")
                        window.decorView.systemUiVisibility = (
                            View.SYSTEM_UI_FLAG_FULLSCREEN or
                            View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        )
                    }

                    override fun onHideCustomView() {
                        super.onHideCustomView()
                        if (customView == null) return
                        
                        // Remove custom view from root view
                        val decor = window.decorView as FrameLayout
                        decor.removeView(customView)
                        customView = null
                        
                        // Restore original WebView visibility
                        this@apply.visibility = View.VISIBLE
                        
                        // Restore system UI visibility flags
                        @Suppress("DEPRECATION")
                        window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_VISIBLE
                        
                        customViewCallback?.onCustomViewHidden()
                        customViewCallback = null
                    }
                }
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

        val bridge = AndroidBridge(nativeWebView, tauriWebView, this)
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

class AndroidBridge(
    private val nativeWebView: WebView?,
    private val tauriWebView: WebView?,
    private val context: Context
) {
    
    @JavascriptInterface
    fun hideContextMenu() {
        Handler(Looper.getMainLooper()).post {
            nativeWebView?.bringToFront()
        }
    }

    // 🚨 BASE64 සහ NATIVE URL දෙකටම වැඩ කරන SUPREME DOWNLOAD MANAGER එක 🚨
    @JavascriptInterface
    fun downloadImage(url: String) {
        Handler(Looper.getMainLooper()).post {
            try {
                var fileName = "RC_Image_${System.currentTimeMillis()}.jpg"

                if (url.startsWith("data:")) {
                    // Google එකේ Base64 Images Gallery එකට සේව් කරන කෑල්ල
                    val base64Data = url.substringAfter(",")
                    val decodedBytes = Base64.decode(base64Data, Base64.DEFAULT)
                    
                    val resolver = context.contentResolver
                    val contentValues = ContentValues().apply {
                        put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
                        put(MediaStore.MediaColumns.MIME_TYPE, "image/jpeg")
                        put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/RC Browser")
                    }
                    
                    val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, contentValues)
                    if (uri != null) {
                        resolver.openOutputStream(uri)?.use { 
                            it.write(decodedBytes) 
                        }
                    }
                    sendSuccessEvent(url, fileName)
                } else {
                    // සාමාන්‍ය HTTP/HTTPS URL බාන කෑල්ල
                    val uri = Uri.parse(url)
                    fileName = uri.lastPathSegment ?: fileName
                    if (!fileName.contains(".")) fileName += ".jpg"

                    val request = DownloadManager.Request(uri).apply {
                        setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                        setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName)
                        setTitle(fileName)
                        setDescription("Downloading image via RC Browser...")
                        @Suppress("DEPRECATION")
                        allowScanningByMediaScanner() // Gallery එකට පෙන්නන්න කියනවා
                    }
                    
                    val dm = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
                    dm.enqueue(request)
                    
                    sendSuccessEvent(url, fileName)
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    // React History එක Update කරන්න කතා කරන කෑල්ල
    private fun sendSuccessEvent(url: String, fileName: String) {
        val escapedUrl = url.replace("'", "\\'").replace("\"", "\\\"")
        val escapedPath = fileName.replace("'", "\\'").replace("\"", "\\\"")
        val js = "window.dispatchEvent(new CustomEvent('rc-download-finished', { detail: { id: Date.now().toString(), url: '$escapedUrl', path: '$escapedPath', timestamp: Date.now(), status: 'completed' } }));"
        tauriWebView?.evaluateJavascript(js, null)
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