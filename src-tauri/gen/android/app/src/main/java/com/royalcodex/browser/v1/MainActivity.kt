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
import android.widget.Toast
import android.webkit.URLUtil
import android.webkit.DownloadListener

class MainActivity : TauriActivity() {
    private var tauriWebView: WebView? = null
    var nativeWebView: WebView? = null
    private var customView: View? = null
    private var customViewCallback: WebChromeClient.CustomViewCallback? = null
    private var androidBridge: AndroidBridge? = null
    private val adBlacklist = HashSet<String>()

    @SuppressLint("SetJavaScriptEnabled", "ClickableViewAccessibility")
    override fun onWebViewCreate(webView: WebView) {
        super.onWebViewCreate(webView)
        tauriWebView = webView
        loadAdBlacklist()

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
                    override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                        super.onPageStarted(view, url, favicon)
                        injectPrivacyShieldScripts(view)
                    }
                    override fun onPageFinished(view: WebView?, url: String?) {
                        super.onPageFinished(view, url)
                        url?.let { syncUrlToReact(it) }
                        injectPrivacyShieldScripts(view)
                    }

                    override fun shouldInterceptRequest(
                        view: WebView?,
                        request: android.webkit.WebResourceRequest?
                    ): android.webkit.WebResourceResponse? {
                        if (request != null && request.url != null) {
                            val urlString = request.url.toString()
                            if (androidBridge?.isPrivacyShieldEnabled() == true && isAdOrTracker(urlString)) {
                                return android.webkit.WebResourceResponse(
                                    "text/plain",
                                    "UTF-8",
                                    java.io.ByteArrayInputStream("".toByteArray())
                                )
                            }
                        }
                        return super.shouldInterceptRequest(view, request)
                    }

                    override fun shouldOverrideUrlLoading(
                        view: WebView?,
                        request: android.webkit.WebResourceRequest?
                    ): Boolean {
                        if (request != null && request.url != null) {
                            val url = request.url
                            val urlString = url.toString()

                            if (androidBridge?.isPrivacyShieldEnabled() == true) {
                                // Block direct navigation to ad/tracker domains
                                if (isAdOrTracker(urlString)) {
                                    return true
                                }

                                val isForMainFrame = request.isForMainFrame
                                val hasGesture = request.hasGesture()

                                if (isForMainFrame && !hasGesture) {
                                    val currentUrl = view?.url
                                    if (currentUrl != null && currentUrl.isNotEmpty() && currentUrl != "about:blank") {
                                        val currentHost = Uri.parse(currentUrl).host?.lowercase() ?: ""
                                        val newHost = url.host?.lowercase() ?: ""
                                        if (currentHost.isNotEmpty() && newHost.isNotEmpty() && currentHost != newHost) {
                                            // Intercept and block sudden redirects without user gesture
                                            return true
                                        }
                                    }
                                }
                            }
                        }
                        return super.shouldOverrideUrlLoading(view, request)
                    }
                }

                setDownloadListener { url, userAgent, contentDisposition, mimetype, _ ->
                    val fileName = URLUtil.guessFileName(url, contentDisposition, mimetype)
                    val extension = fileName.substringAfterLast('.', "").lowercase()

                    val blacklist = setOf("sh", "bat", "cmd", "vbs", "exe", "bin")

                    if (blacklist.contains(extension)) {
                        Toast.makeText(this@MainActivity, "Download blocked: Potentially harmful file.", Toast.LENGTH_LONG).show()
                        return@setDownloadListener
                    }

                    try {
                        val request = DownloadManager.Request(Uri.parse(url)).apply {
                            setMimeType(mimetype)
                            @Suppress("DEPRECATION")
                            allowScanningByMediaScanner()
                            setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                            setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName)
                            setTitle(fileName)
                            setDescription("Downloading file...")
                            addRequestHeader("User-Agent", userAgent)
                        }

                        val dm = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
                        dm.enqueue(request)
                        Toast.makeText(this@MainActivity, "Download started...", Toast.LENGTH_SHORT).show()
                    } catch (e: Exception) {
                        Toast.makeText(this@MainActivity, "Download failed: ${e.localizedMessage}", Toast.LENGTH_SHORT).show()
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
        androidBridge = bridge
        webView.addJavascriptInterface(bridge, "NativeBridge")
        webView.addJavascriptInterface(bridge, "AndroidBridge")
    }

    private val adPatterns = arrayOf(
        "doubleclick", "googlesyndication", "googletagmanager", "googletagservices",
        "google-analytics", "adservice.google", "quantserve", "quantcast",
        "scorecardresearch", "criteo", "taboola", "outbrain", "amazon-adsystem",
        "popads", "popcash", "adnxs", "adcolony", "unityads", "applovin",
        "ironsrc", "hotjar", "optimizely", "crazyegg", "mixpanel", "bugsnag",
        "sentry.io", "flurry", "chartbeat", "newrelic", "casalemedia",
        "rubiconproject", "pubmatic", "openx", "sovrn", "triplelift",
        "smartadserver", "bidswitch", "bluekai", "liveramp", "lotame",
        "teads.tv", "thetradedesk", "appnexus", "adroll", "moatads",
        "integralads", "doubleverify", "appsflyer", "adjust", "onesignal",
        "clarity.ms", "yandexmetrika", "yandex.ru", "clickcease", "adform",
        "adsystem", "adtarget", "yieldmo", "indexww", "adobedtm",
        "omtrdc", "demdex", "everesttech", "adsrvr", "liadm", "krxd",
        "servedby-buysellads", "buysellads", "carbonads", "adzerk",
        "lijit", "revcontent", "mgid", "ads.js", "adsbygoogle", "prebid.js",
        "/track/", "/banners/", "/adserver/", "fbevents.js", "/adframe.js",
        "/popunder", "ad_id=", "adclient=", "clickid=", "fbclid=", "gclid=",
        "ad_slot=", "ad_type="
    )

    fun isAdOrTracker(url: String): Boolean {
        // First check wildcard patterns (highly effective & fast)
        val lowerUrl = url.lowercase()
        for (pattern in adPatterns) {
            if (lowerUrl.contains(pattern)) {
                return true
            }
        }

        // Secondly segment walk backwards O(N) against the massive StevenBlack blacklist!
        val parsedUri = try {
            Uri.parse(url)
        } catch (e: Exception) {
            return false
        }
        val host = parsedUri.host?.lowercase() ?: ""
        if (host.isEmpty()) return false
        
        var currentDomain = host
        while (currentDomain.contains(".")) {
            synchronized(adBlacklist) {
                if (adBlacklist.contains(currentDomain)) {
                    return true
                }
            }
            val nextDot = currentDomain.indexOf('.')
            if (nextDot == -1 || nextDot == currentDomain.length - 1) {
                break
            }
            currentDomain = currentDomain.substring(nextDot + 1)
        }
        synchronized(adBlacklist) {
            if (adBlacklist.contains(currentDomain)) {
                return true
            }
        }

        return false
    }

    private fun loadAdBlacklist() {
        Thread {
            try {
                val inputStream = assets.open("ad_domains.txt")
                val reader = inputStream.bufferedReader()
                val domains = reader.readLines()
                synchronized(adBlacklist) {
                    adBlacklist.addAll(domains.map { it.trim().lowercase() })
                }
                inputStream.close()
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }.start()
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

    private fun injectPrivacyShieldScripts(view: WebView?) {
        if (view == null || androidBridge?.isPrivacyShieldEnabled() != true) return

        val js = """
            (function() {
                const adPatterns = [
                    "doubleclick", "googlesyndication", "googletagmanager", "googletagservices",
                    "google-analytics", "adservice.google", "quantserve", "quantcast",
                    "scorecardresearch", "criteo", "taboola", "outbrain", "amazon-adsystem",
                    "popads", "popcash", "adnxs", "adcolony", "unityads", "applovin",
                    "ironsrc", "hotjar", "optimizely", "crazyegg", "mixpanel", "bugsnag",
                    "sentry.io", "flurry", "chartbeat", "newrelic", "casalemedia",
                    "rubiconproject", "pubmatic", "openx", "sovrn", "triplelift",
                    "smartadserver", "bidswitch", "bluekai", "liveramp", "lotame",
                    "teads.tv", "thetradedesk", "appnexus", "adroll", "moatads",
                    "integralads", "doubleverify", "appsflyer", "adjust", "onesignal",
                    "clarity.ms", "yandexmetrika", "yandex.ru", "clickcease", "adform",
                    "adsystem", "adtarget", "yieldmo", "indexww", "adobedtm",
                    "omtrdc", "demdex", "everesttech", "adsrvr", "liadm", "krxd",
                    "servedby-buysellads", "buysellads", "carbonads", "adzerk",
                    "lijit", "revcontent", "mgid", "ads.js", "adsbygoogle", "prebid.js",
                    "/track/", "/banners/", "/adserver/", "fbevents.js", "/adframe.js",
                    "/popunder", "ad_id=", "adclient=", "clickid=", "fbclid=", "gclid=",
                    "ad_slot=", "ad_type="
                ];

                function isAdOrTracker(url) {
                    if (!url) return false;
                    const lowerUrl = url.toString().toLowerCase();
                    for (const pattern of adPatterns) {
                        if (lowerUrl.includes(pattern)) {
                            return true;
                        }
                    }
                    return false;
                }

                // --- 1. Interceptors Setup ---
                function setupInterceptors() {
                    if (window.__rcSubresourceHooked) return;
                    window.__rcSubresourceHooked = true;
                    window.__privacyShieldOn = true;

                    // Patch fetch
                    const originalFetch = window.fetch;
                    window.fetch = async function(resource, init) {
                        let url = "";
                        if (typeof resource === 'string') {
                            url = resource;
                        } else if (resource instanceof Request) {
                            url = resource.url;
                        } else if (resource && typeof resource.toString === 'function') {
                            url = resource.toString();
                        }
                        
                        if (window.__privacyShieldOn && isAdOrTracker(url)) {
                            console.log("Blocked fetch ad/tracker request (DOM level):", url);
                            return new Response("", { status: 404, statusText: "Blocked by Privacy Shield" });
                        }
                        return originalFetch.apply(this, arguments);
                    };

                    // Patch XHR open
                    const originalOpen = XMLHttpRequest.prototype.open;
                    XMLHttpRequest.prototype.open = function(method, url) {
                        this.__requestUrl = url;
                        if (window.__privacyShieldOn && isAdOrTracker(url)) {
                            console.log("Blocked XHR open ad/tracker request (DOM level):", url);
                            this.__blockedByPrivacyShield = true;
                        }
                        return originalOpen.apply(this, arguments);
                    };

                    const originalSend = XMLHttpRequest.prototype.send;
                    XMLHttpRequest.prototype.send = function() {
                        if (this.__blockedByPrivacyShield) {
                            console.log("Blocking XHR send ad/tracker request:", this.__requestUrl);
                            this.dispatchEvent(new Event('error'));
                            return;
                        }
                        return originalSend.apply(this, arguments);
                    };
                }

                // --- 2. Cosmetic Element Hiding & Direct Styling Overrides ---
                const cssSelectors = '.ad-banner, .adsbygoogle, #ad-container, .taboola, .outbrain, [id^="google_ads_iframe"], [class*="-ad-"], [id*="-ad-"], .ad-slot, .ad-zone, .ad-box, .advertisement, .ad-container, .ads-container, .ad-wrapper, .ad-wrap, .ad-unit, .ads-wrapper, [class*="AdClass"], [class*="AdUnit"], [class*="AdWrapper"], [class*="advertisement"], [class*="AdContent"], [id*="AdContent"], [id*="AdContainer"], [id*="google_ads"], [id*="div-gpt-ad"], amp-ad, ins.adsbygoogle, .ad-holder, .ad-label, .ad-text, .banner-ad, .banner_ad, #ad-banner, #ad-slot, #banner-ad';

                function enforceCosmeticHiding() {
                    if (!window.__privacyShieldOn) return;
                    
                    // Ensure stylesheet exists in document
                    var styleId = 'rc-privacy-shield-cosmetic';
                    var style = document.getElementById(styleId);
                    if (!style) {
                        style = document.createElement('style');
                        style.id = styleId;
                        (document.head || document.documentElement).appendChild(style);
                    }
                    const expectedCss = cssSelectors + ' { display: none !important; visibility: hidden !important; opacity: 0 !important; height: 0 !important; width: 0 !important; pointer-events: none !important; }';
                    if (style.innerHTML !== expectedCss) {
                        style.innerHTML = expectedCss;
                    }

                    // Direct style override to guarantee hidden state and bypass inline style manipulation
                    try {
                        const elements = document.querySelectorAll(cssSelectors);
                        for (let i = 0; i < elements.length; i++) {
                            const el = elements[i];
                            if (el.style.display !== 'none') {
                                el.style.setProperty('display', 'none', 'important');
                                el.style.setProperty('visibility', 'hidden', 'important');
                                el.style.setProperty('opacity', '0', 'important');
                                el.style.setProperty('height', '0', 'important');
                                el.style.setProperty('width', '0', 'important');
                                el.style.setProperty('pointer-events', 'none', 'important');
                            }
                        }
                    } catch (e) {}
                }

                // --- 3. MutationObserver Setup ---
                let observer = null;
                function startContinuousEnforcement() {
                    setupInterceptors();
                    enforceCosmeticHiding();

                    if (observer) return;
                    
                    if (document.documentElement) {
                        observer = new MutationObserver(function(mutations) {
                            enforceCosmeticHiding();
                        });
                        observer.observe(document.documentElement, {
                            childList: true,
                            subtree: true,
                            attributes: true,
                            attributeFilter: ['style', 'class', 'id']
                        });
                    }
                }

                // Run immediately (synchronous / early launch)
                setupInterceptors();
                enforceCosmeticHiding();

                // Binds on DOMContentLoaded
                if (document.readyState === "loading") {
                    document.addEventListener("DOMContentLoaded", startContinuousEnforcement);
                } else {
                    startContinuousEnforcement();
                }

                // Continuous verification loop (failsafe check every 100ms for first 5 seconds to defend against fast re-writes)
                let checkCount = 0;
                const intervalId = setInterval(function() {
                    setupInterceptors();
                    enforceCosmeticHiding();
                    startContinuousEnforcement();
                    checkCount++;
                    if (checkCount > 50) {
                        clearInterval(intervalId);
                    }
                }, 100);

            })();
        """.trimIndent()
        view.evaluateJavascript(js, null)
    }
}

class AndroidBridge(
    private val nativeWebView: WebView?,
    private val tauriWebView: WebView?,
    private val context: Context
) {
    private var privacyShieldEnabled: Boolean = true

    @JavascriptInterface
    fun setPrivacyShield(enabled: Boolean) {
        Handler(Looper.getMainLooper()).post {
            privacyShieldEnabled = enabled
        }
    }

    fun isPrivacyShieldEnabled(): Boolean {
        return privacyShieldEnabled
    }
    
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

    @JavascriptInterface
    fun reloadWebview() {
        reload()
    }
}