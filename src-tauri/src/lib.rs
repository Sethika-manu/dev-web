use serde::Serialize;
use std::net::{SocketAddr, TcpStream};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

#[cfg(desktop)]
use tauri::{PhysicalPosition, PhysicalSize, WebviewBuilder};

#[cfg(mobile)]
use tauri::{PhysicalPosition, PhysicalSize, WebviewWindowBuilder};

#[derive(Serialize)]
struct SystemMetrics {
    cpu: f32,
    ram: u64,
    ping: u64,
}

struct SystemState(std::sync::Mutex<sysinfo::System>);

struct PrivacyState(std::sync::atomic::AtomicBool);

fn get_ping() -> u64 {
    let start = Instant::now();
    let addr = "1.1.1.1:53".parse::<SocketAddr>().unwrap();
    if TcpStream::connect_timeout(&addr, Duration::from_millis(1000)).is_ok() {
        start.elapsed().as_millis() as u64
    } else {
        0
    }
}

// Hex Decoder
fn decode_hex(hex_str: &str) -> String {
    let mut bytes = Vec::new();
    let mut chars = hex_str.chars().peekable();
    while chars.peek().is_some() {
        let chunk: String = chars.by_ref().take(2).collect();
        if let Ok(byte) = u8::from_str_radix(&chunk, 16) {
            bytes.push(byte);
        }
    }
    String::from_utf8_lossy(&bytes).into_owned()
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

fn get_adblock_engine() -> &'static adblock::engine::Engine {
    use adblock::engine::Engine;
    use adblock::lists::{FilterSet, ParseOptions};
    use std::sync::OnceLock;

    static ADBLOCK_ENGINE: OnceLock<Engine> = OnceLock::new();

    ADBLOCK_ENGINE.get_or_init(|| {
        let rules_data = include_str!("easylist.txt");
        let mut filter_set = FilterSet::new(true);
        let parse_options = ParseOptions {
            ..Default::default()
        };
        
        for line in rules_data.lines() {
            let line_trimmed = line.trim();
            if !line_trimmed.is_empty() && !line_trimmed.starts_with('!') {
                let _ = filter_set.add_filter(line_trimmed, parse_options.clone());
            }
        }
        
        Engine::from_filter_set(filter_set, true)
    })
}

fn is_ad_or_tracker_rust(url_str: &str) -> bool {
    use adblock::request::Request;

    let engine = get_adblock_engine();

    if let Ok(request) = Request::new(url_str, "http://example.com", "other") {
        let blocker_result = engine.check_network_request(&request);
        blocker_result.matched
    } else {
        false
    }
}

#[tauri::command]
fn get_cosmetic_rules(state: tauri::State<'_, PrivacyState>, url: String) -> String {
    if !state.0.load(std::sync::atomic::Ordering::Relaxed) {
        return "".to_string();
    }
    let engine = get_adblock_engine();
    let resources = engine.url_cosmetic_resources(&url);
    let selectors: Vec<String> = resources.hide_selectors.into_iter().collect();
    if selectors.is_empty() {
        "".to_string()
    } else {
        format!(
            "{} {{ display: none !important; visibility: hidden !important; opacity: 0 !important; height: 0 !important; width: 0 !important; pointer-events: none !important; }}",
            selectors.join(", ")
        )
    }
}

#[tauri::command]
async fn set_privacy_shield(
    app: AppHandle,
    state: tauri::State<'_, PrivacyState>,
    enabled: bool,
) -> Result<(), String> {
    state.0.store(enabled, std::sync::atomic::Ordering::Relaxed);

    // Evaluate JS in all open webviews to dynamically sync the state!
    let webviews = app.webviews();
    let js = format!("window.__privacyShieldOn = {};", enabled);
    for (_, webview) in webviews {
        let _ = webview.eval(&js);
    }
    
    Ok(())
}

#[tauri::command]
async fn trigger_download(app: AppHandle, label: String, url: String) -> Result<(), String> {
    if let Some(webview) = app.get_webview(&label) {
        let js = format!(
            "var a = document.createElement('a'); a.href = '{}'; a.download = ''; document.body.appendChild(a); a.click(); document.body.removeChild(a);",
            url.replace("'", "\\'")
        );
        let _ = webview.eval(&js);
    }
    Ok(())
}

#[tauri::command]
async fn open_webview(
    app: AppHandle,
    label: String,
    url: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    theme: String,
) -> Result<(), String> {
    let url_data: tauri::Url = url.parse().map_err(|e| format!("Invalid URL: {}", e))?;

    #[cfg(desktop)]
    {
        let main_window = app
            .get_window("main")
            .or_else(|| app.get_window("main_window"))
            .ok_or("Main window not found")?;

        if let Some(webview) = app.get_webview(&label) {
            let _ = webview.navigate(url_data);
            let _ = webview.set_position(PhysicalPosition::new(x as i32, y as i32));
            let _ = webview.set_size(PhysicalSize::new(width as u32, height as u32));
            return Ok(());
        }

        let privacy_shield_on = app.state::<PrivacyState>().0.load(std::sync::atomic::Ordering::Relaxed);
        
        let mut initial_cosmetic_css = String::new();
        if privacy_shield_on {
            let engine = get_adblock_engine();
            let resources = engine.url_cosmetic_resources(url_data.as_str());
            let selectors: Vec<String> = resources.hide_selectors.into_iter().collect();
            if !selectors.is_empty() {
                initial_cosmetic_css = format!(
                    "{} {{ display: none !important; visibility: hidden !important; opacity: 0 !important; height: 0 !important; width: 0 !important; pointer-events: none !important; }}",
                    selectors.join(", ")
                );
            }
        }

        let mut webview_builder =
            WebviewBuilder::new(&label, tauri::WebviewUrl::External(url_data));

        webview_builder = webview_builder.initialization_script(&format!(
            r#"
            (function() {{
                window.__privacyShieldOn = {};
                const initialCosmeticCss = {};
                
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

                function isAdOrTracker(url) {{
                    if (!url) return false;
                    const lowerUrl = url.toString().toLowerCase();
                    for (const pattern of adPatterns) {{
                        if (lowerUrl.includes(pattern)) {{
                            return true;
                        }}
                    }}
                    return false;
                }}

                // --- 1. Fetch & XHR Interceptor Setup ---
                const setupInterceptors = () => {{
                    if (window.__interceptorsSet) return;
                    window.__interceptorsSet = true;

                    // Fetch Interceptor
                    const originalFetch = window.fetch;
                    window.fetch = async function(resource, init) {{
                        let url = "";
                        if (typeof resource === 'string') {{
                            url = resource;
                        }} else if (resource instanceof Request) {{
                            url = resource.url;
                        }} else if (resource && typeof resource.toString === 'function') {{
                            url = resource.toString();
                        }}
                        
                        if (window.__privacyShieldOn && isAdOrTracker(url)) {{
                            console.log("Blocked fetch ad/tracker request (DOM level):", url);
                            return new Response("", {{ status: 404, statusText: "Blocked by Privacy Shield" }});
                        }}
                        return originalFetch.apply(this, arguments);
                    }};

                    // XHR Interceptor (Synchronous patch in open)
                    const originalOpen = XMLHttpRequest.prototype.open;
                    XMLHttpRequest.prototype.open = function(method, url) {{
                        this.__requestUrl = url;
                        if (window.__privacyShieldOn && isAdOrTracker(url)) {{
                            console.log("Blocked XHR open ad/tracker request (DOM level):", url);
                            this.__blockedByPrivacyShield = true;
                        }}
                        return originalOpen.apply(this, arguments);
                    }};

                    const originalSend = XMLHttpRequest.prototype.send;
                    XMLHttpRequest.prototype.send = function() {{
                        if (this.__blockedByPrivacyShield) {{
                            console.log("Blocking XHR send ad/tracker request:", this.__requestUrl);
                            this.dispatchEvent(new Event('error'));
                            return;
                        }}
                        return originalSend.apply(this, arguments);
                    }};

                    // window.open / Popup Interceptor
                    const originalWindowOpen = window.open;
                    window.open = function(url, name, specs) {{
                        if (window.__privacyShieldOn) {{
                            if (isAdOrTracker(url)) {{
                                console.log("Blocked ad/tracker popup:", url);
                                return null;
                            }}
                            
                            try {{
                                const currentHost = window.location.hostname.toLowerCase();
                                const newHost = new URL(url, window.location.href).hostname.toLowerCase();
                                if (currentHost !== newHost) {{
                                    console.log("Blocked cross-domain popup redirect:", url);
                                    return null;
                                }}
                            }} catch (e) {{}}
                        }}
                        return originalWindowOpen.apply(this, arguments);
                    }};
                }};

                // --- 2. Cosmetic Hiding Styles Setup ---
                const universalCss = '.ad-banner, .adsbygoogle, #ad-container, .taboola, .outbrain, [id^="google_ads_iframe"], [class*="-ad-"], [id*="-ad-"], .ad-slot, .ad-zone, .ad-box, .advertisement';

                const applyAllCosmeticHiding = () => {{
                    if (!window.__privacyShieldOn) return;

                    // 1. Inject or re-inject initial cosmetic rules style element
                    if (initialCosmeticCss) {{
                        let styleId = 'rc-privacy-shield-cosmetic-initial';
                        let style = document.getElementById(styleId);
                        if (!style) {{
                            style = document.createElement('style');
                            style.id = styleId;
                            (document.head || document.documentElement).appendChild(style);
                        }}
                        if (style.innerHTML !== initialCosmeticCss) {{
                            style.innerHTML = initialCosmeticCss;
                        }}
                    }}

                    // 2. Inject or re-inject universal fallback cosmetic rules style element
                    let uniStyleId = 'rc-privacy-shield-cosmetic';
                    let uniStyle = document.getElementById(uniStyleId);
                    if (!uniStyle) {{
                        uniStyle = document.createElement('style');
                        uniStyle.id = uniStyleId;
                        (document.head || document.documentElement).appendChild(uniStyle);
                    }}
                    const uniRules = universalCss + ' {{ display: none !important; visibility: hidden !important; opacity: 0 !important; height: 0 !important; width: 0 !important; pointer-events: none !important; }}';
                    if (uniStyle.innerHTML !== uniRules) {{
                        uniStyle.innerHTML = uniRules;
                    }}

                    // 3. Scan DOM and enforce display: none !important directly on matching elements to override inline styles
                    try {{
                        const elements = document.querySelectorAll(universalCss);
                        for (let i = 0; i < elements.length; i++) {{
                            const el = elements[i];
                            if (el.style.display !== 'none') {{
                                el.style.setProperty('display', 'none', 'important');
                                el.style.setProperty('visibility', 'hidden', 'important');
                                el.style.setProperty('opacity', '0', 'important');
                                el.style.setProperty('height', '0', 'important');
                                el.style.setProperty('width', '0', 'important');
                                el.style.setProperty('pointer-events', 'none', 'important');
                            }}
                        }}
                    }} catch (e) {{}}
                }};

                // Dynamic URL-specific cosmetic rules query from engine
                let dynamicCss = "";
                const injectDynamicCosmeticRules = async () => {{
                    if (!window.__privacyShieldOn) return;
                    try {{
                        const invokeFn = window.__TAURI__?.core?.invoke || window.__TAURI_INTERNALS__?.invoke;
                        if (!invokeFn) return;
                        const css = await invokeFn("get_cosmetic_rules", {{ url: window.location.href }});
                        if (css && css !== dynamicCss) {{
                            dynamicCss = css;
                            let styleId = 'rc-privacy-shield-cosmetic-dynamic';
                            let style = document.getElementById(styleId);
                            if (!style) {{
                                style = document.createElement('style');
                                style.id = styleId;
                                (document.head || document.documentElement).appendChild(style);
                            }}
                            style.innerHTML = css;
                        }}
                        
                        // Force direct style override for dynamic rules selectors as well
                        if (dynamicCss) {{
                            const selectorPart = dynamicCss.split(' {{')[0];
                            if (selectorPart) {{
                                const elements = document.querySelectorAll(selectorPart);
                                for (let i = 0; i < elements.length; i++) {{
                                    const el = elements[i];
                                    if (el.style.display !== 'none') {{
                                        el.style.setProperty('display', 'none', 'important');
                                        el.style.setProperty('visibility', 'hidden', 'important');
                                    }}
                                }}
                            }}
                        }}
                    }} catch (e) {{
                        console.error("Error fetching cosmetic rules:", e);
                    }}
                }};

                // --- 3. MutationObserver and DOM Event Hooks ---
                const startContinuousEnforcement = () => {{
                    setupInterceptors();
                    applyAllCosmeticHiding();
                    injectDynamicCosmeticRules();

                    const observer = new MutationObserver((mutations) => {{
                        setupInterceptors();
                        applyAllCosmeticHiding();
                        for (let i = 0; i < mutations.length; i++) {{
                            if (mutations[i].addedNodes.length > 0) {{
                                if (dynamicCss) {{
                                    const selectorPart = dynamicCss.split(' {{')[0];
                                    if (selectorPart) {{
                                        try {{
                                            const elements = document.querySelectorAll(selectorPart);
                                            for (let j = 0; j < elements.length; j++) {{
                                                elements[j].style.setProperty('display', 'none', 'important');
                                            }}
                                        }} catch(err) {{}}
                                    }}
                                }}
                                break;
                            }}
                        }}
                    }});

                    observer.observe(document.documentElement, {{
                        childList: true,
                        subtree: true,
                        attributes: true,
                        attributeFilter: ['style', 'class', 'id']
                    }});
                }};

                // Run immediately (synchronous / early launch)
                setupInterceptors();
                applyAllCosmeticHiding();

                // Hook to DOMContentLoaded to bind the MutationObserver
                if (document.readyState === "loading") {{
                    document.addEventListener("DOMContentLoaded", startContinuousEnforcement);
                }} else {{
                    startContinuousEnforcement();
                }}

                // Support SPA and link navigation
                const patchHistory = () => {{
                    const originalPushState = history.pushState;
                    history.pushState = function() {{
                        originalPushState.apply(this, arguments);
                        setTimeout(injectDynamicCosmeticRules, 50);
                    }};
                    const originalReplaceState = history.replaceState;
                    history.replaceState = function() {{
                        originalReplaceState.apply(this, arguments);
                        setTimeout(injectDynamicCosmeticRules, 50);
                    }};
                    window.addEventListener('popstate', () => setTimeout(injectDynamicCosmeticRules, 50));
                }};
                try {{
                    patchHistory();
                }} catch (e) {{}}

            }})();
            "#,
            privacy_shield_on,
            serde_json::to_string(&initial_cosmetic_css).unwrap_or_else(|_| "\"\"".to_string())
        ));

        // 🚨 100% RELIABLE DOUBLE-TAP HACK 🚨
        webview_builder = webview_builder.initialization_script(r#"
            (function() {
                var isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
                if (!isMobile) return;

                // _blank Clicks Fix
                document.addEventListener('click', function(e) {
                    try {
                        if (e.target && typeof e.target.closest === 'function') {
                            var link = e.target.closest('a');
                            if (link && link.getAttribute('target') === '_blank') {
                                link.setAttribute('target', '_self');
                            }
                        }
                    } catch(err) {}
                }, false);

                // Android System Callouts Hide කරනවා
                var style = document.createElement('style');
                style.innerHTML = 'a, img { -webkit-touch-callout: none !important; -webkit-tap-highlight-color: transparent !important; }';
                document.head.appendChild(style);

                var lastTapTime = 0;

                // 🚨 Double Tap Detector (Loose Strictness for higher accuracy) 🚨
                document.addEventListener('touchend', function(e) {
                    var currentTime = new Date().getTime();
                    var tapLength = currentTime - lastTapTime;
                    
                    // තත්පර බාගයක් (500ms) ඇතුලත දෙවෙනි Tap එක වැදුනොත්
                    if (tapLength > 0 && tapLength < 500) {
                        var touch = e.changedTouches ? e.changedTouches[0] : null;
                        var x = touch ? touch.clientX : (e.clientX || 0);
                        var y = touch ? touch.clientY : (e.clientY || 0);

                        if (x === 0 && y === 0) return;

                        // X-Ray Scanner: Google Invisible Overlays විනිවිද යන්න
                        var elements = document.elementsFromPoint(x, y);
                        var targetUrl = null;

                        for (var i = 0; i < elements.length; i++) {
                            var el = elements[i];
                            if (!el || !el.tagName) continue;
                            
                            var tag = el.tagName.toLowerCase();
                            if (tag === 'img') {
                                targetUrl = el.src || el.getAttribute('data-src') || el.getAttribute('data-original');
                                if (targetUrl) break; // Image එකක් අහු වුණ ගමන් Loop එක නවත්තනවා!
                            }
                        }

                        if (targetUrl) {
                            e.preventDefault(); 
                            e.stopPropagation();
                            
                            try { if (navigator.vibrate) navigator.vibrate([50, 50]); } catch(err){}
                            
                            var payloadStr = "image|||" + targetUrl;
                            var utf8 = new TextEncoder().encode(payloadStr);
                            var hex = '';
                            for(var j=0; j<utf8.length; j++) {
                                hex += utf8[j].toString(16).padStart(2, '0');
                            }
                            
                            // location.replace is bulletproof against SPA routers
                            window.location.replace("https://rc.context.menu/?data=" + hex);
                        }
                        lastTapTime = 0; // Reset
                    } else {
                        lastTapTime = currentTime;
                    }
                }, { passive: false });
            })();
        "#);

        let app_for_nav = app.clone();
        webview_builder = webview_builder.on_navigation(move |url| {
            let url_str = url.as_str();

            if url_str.starts_with("https://rc.context.menu/?data=") {
                let hex_data = url_str.trim_start_matches("https://rc.context.menu/?data=");
                let decoded = decode_hex(hex_data);
                let parts: Vec<&str> = decoded.split("|||").collect();

                if parts.len() == 2 {
                    let payload = serde_json::json!({
                        "url": parts[1]
                    });
                    // React එකට Download Event එක යවනවා
                    let _ = app_for_nav.emit("auto-download-image", payload);
                }
                return false;
            }

            // PC (Tauri/Rust) Privacy Shield Interception
            if app_for_nav.state::<PrivacyState>().0.load(std::sync::atomic::Ordering::Relaxed) {
                if is_ad_or_tracker_rust(url_str) {
                    println!("Blocked ad/tracker navigation on PC: {}", url_str);
                    return false;
                }
            }

            true
        });

        webview_builder = webview_builder.on_download(move |webview, event| {
            match event {
                tauri::webview::DownloadEvent::Requested { url, destination } => {
                    let payload = serde_json::json!({
                        "url": url.as_str(),
                        "state": "started",
                        "path": destination.to_string_lossy().to_string(),
                    });
                    let _ = webview.app_handle().emit("download-event", payload);
                }
                tauri::webview::DownloadEvent::Finished { url, path, success } => {
                    let state = if success { "finished" } else { "failed" };
                    let path_str = path.as_ref().map(|p| p.to_string_lossy().into_owned()).unwrap_or_default();
                    
                    let payload = serde_json::json!({
                        "url": url.as_str(),
                        "state": state,
                        "path": path_str.clone(),
                    });
                    let _ = webview.app_handle().emit("download-event", payload);
                    
                    if success {
                        if let Some(main_webview) = webview.app_handle().get_webview("main").or_else(|| webview.app_handle().get_webview("main_window")) {
                            let js = format!(
                                "window.dispatchEvent(new CustomEvent('rc-download-finished', {{ detail: {{ id: Date.now().toString(), url: '{}', path: '{}', timestamp: Date.now(), status: 'completed' }} }}))",
                                url.as_str().replace("'", "\\'"),
                                path_str.replace("\\", "\\\\").replace("'", "\\'")
                            );
                            let _ = main_webview.eval(&js);
                        }
                    }
                }
                _ => {}
            }
            true
        });

        main_window
            .add_child(
                webview_builder,
                PhysicalPosition::new(x as i32, y as i32),
                PhysicalSize::new(width as u32, height as u32),
            )
            .map_err(|e| format!("Failed to create webview: {}", e))?;

        if let Some(webview) = app.get_webview(&label) {
            let js = if theme == "dark" {
                "document.documentElement.classList.add('dark');"
            } else {
                "document.documentElement.classList.remove('dark');"
            };
            let _ = webview.eval(js);
        }
    }

    #[cfg(mobile)]
    {
        let _ = app;
        let _ = label;
        let _ = url;
        let _ = x;
        let _ = y;
        let _ = width;
        let _ = height;
        let _ = theme;
    }

    Ok(())
}

#[tauri::command]
async fn close_webview(app: AppHandle, label: String) -> Result<(), String> {
    #[cfg(desktop)]
    {
        if let Some(webview) = app.get_webview(&label) {
            let _ = webview.close();
        }
    }
    #[cfg(mobile)]
    {
        let _ = app;
        let _ = label;
    }
    Ok(())
}

#[tauri::command]
async fn set_webview_bounds(
    app: AppHandle,
    label: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    #[cfg(desktop)]
    {
        if let Some(webview) = app.get_webview(&label) {
            let _ = webview.set_position(PhysicalPosition::new(x as i32, y as i32));
            let _ = webview.set_size(PhysicalSize::new(width as u32, height as u32));
        }
    }
    #[cfg(mobile)]
    {
        let _ = app;
        let _ = label;
        let _ = x;
        let _ = y;
        let _ = width;
        let _ = height;
    }
    Ok(())
}

#[tauri::command]
async fn resize_browser_webview(
    app: AppHandle,
    label: String,
    top_margin: f64,
    bottom_margin: f64,
    #[allow(unused_variables)] top_margin_css: f64,
    #[allow(unused_variables)] bottom_margin_css: f64,
) -> Result<(), String> {
    #[cfg(desktop)]
    {
        if let Some(webview) = app.get_webview(&label) {
            let main_window = app
                .get_window("main")
                .or_else(|| app.get_window("main_window"))
                .ok_or_else(|| "Main window not found".to_string())?;

            let size = main_window.inner_size().map_err(|e| e.to_string())?;

            let safe_top = top_margin.max(0.0) as i32;
            let safe_bottom = bottom_margin.max(0.0) as i32;

            let mut height = (size.height as i32 - safe_top - safe_bottom).max(100) as u32;
            let y = safe_top;

            if (y + height as i32) > size.height as i32 {
                height = (size.height as i32 - y).max(100) as u32;
            }

            let _ = webview.set_position(PhysicalPosition::new(0, y));
            let _ = webview.set_size(PhysicalSize::new(size.width, height));
        }
    }

    #[cfg(mobile)]
    {
        let _ = app;
        let _ = label;
        let _ = top_margin;
        let _ = bottom_margin;
        let _ = top_margin_css;
        let _ = bottom_margin_css;
    }

    Ok(())
}

#[tauri::command]
async fn set_webview_theme(app: AppHandle, label: String, theme: String) -> Result<(), String> {
    #[cfg(desktop)]
    {
        if let Some(webview) = app.get_webview(&label) {
            let js = if theme == "dark" {
                "document.documentElement.classList.add('dark');"
            } else {
                "document.documentElement.classList.remove('dark');"
            };
            let _ = webview.eval(js);
        }
    }
    #[cfg(mobile)]
    {
        let _ = app;
        let _ = label;
        let _ = theme;
    }
    Ok(())
}

#[tauri::command]
async fn go_back(app: AppHandle, label: String) -> Result<(), String> {
    #[cfg(desktop)]
    {
        if let Some(webview) = app.get_webview(&label) {
            let _ = webview.eval("window.history.back()");
        }
    }
    #[cfg(mobile)]
    {
        let _ = app;
        let _ = label;
    }
    Ok(())
}

#[tauri::command]
async fn go_forward(app: AppHandle, label: String) -> Result<(), String> {
    #[cfg(desktop)]
    {
        if let Some(webview) = app.get_webview(&label) {
            let _ = webview.eval("window.history.forward()");
        }
    }
    #[cfg(mobile)]
    {
        let _ = app;
        let _ = label;
    }
    Ok(())
}

#[tauri::command]
async fn reload_webview(app: AppHandle, label: String) -> Result<(), String> {
    #[cfg(desktop)]
    {
        if let Some(webview) = app.get_webview(&label) {
            let _ = webview.eval("window.location.reload()");
        }
    }
    #[cfg(mobile)]
    {
        let _ = app;
        let _ = label;
    }
    Ok(())
}

#[tauri::command]
async fn navigate_webview(app: AppHandle, label: String, url: String) -> Result<(), String> {
    #[cfg(desktop)]
    {
        let url_data: tauri::Url = url.parse().map_err(|e| format!("Invalid URL: {}", e))?;
        if let Some(webview) = app.get_webview(&label) {
            let _ = webview.navigate(url_data);
        }
    }
    #[cfg(mobile)]
    {
        let _ = app;
        let _ = label;
        let _ = url;
    }
    Ok(())
}

#[tauri::command]
async fn get_system_metrics(
    #[allow(unused_variables)] state: tauri::State<'_, SystemState>,
) -> Result<SystemMetrics, String> {
    #[cfg(desktop)]
    {
        let mut sys = state.0.lock().map_err(|e| e.to_string())?;

        let pid = sysinfo::get_current_pid().map_err(|e| e.to_string())?;
        sys.refresh_process(pid);

        if let Some(process) = sys.process(pid) {
            let cpu = process.cpu_usage();
            let ram = process.memory() / 1024 / 1024;
            let ping = get_ping();

            Ok(SystemMetrics { cpu, ram, ping })
        } else {
            let ping = get_ping();
            Ok(SystemMetrics {
                cpu: 0.0,
                ram: 0,
                ping,
            })
        }
    }
    #[cfg(mobile)]
    {
        Ok(SystemMetrics {
            cpu: 0.0,
            ram: 0,
            ping: 0,
        })
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .plugin(tauri_plugin_shell::init())
        .manage(SystemState(std::sync::Mutex::new(sysinfo::System::new_all())))
        .manage(PrivacyState(std::sync::atomic::AtomicBool::new(true)))
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            open_webview,
            close_webview,
            set_webview_bounds,
            set_webview_theme,
            get_system_metrics,
            go_back,
            go_forward,
            reload_webview,
            navigate_webview,
            resize_browser_webview,
            trigger_download,
            set_privacy_shield,
            get_cosmetic_rules
        ])
        .setup(|app| {
            use tauri::Listener;
            
            #[cfg(mobile)]
            let handle = app.handle().clone();
            
            app.listen("load_native_url", move |event| {
                #[cfg(mobile)]
                {
                    if let Some(webview) = handle.get_webview("main") {
                        if let Ok(payload) = serde_json::from_str::<serde_json::Value>(event.payload()) {
                            if let Some(url) = payload.get("url").and_then(|v| v.as_str()) {
                                let escaped_url = url.replace("'", "\\'");
                                let js = format!("if (window.AndroidBridge) {{ window.AndroidBridge.loadNativeUrl('{}'); }}", escaped_url);
                                let _ = webview.eval(&js);
                            }
                        }
                    }
                }
                #[cfg(desktop)]
                {
                    let _ = event;
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}