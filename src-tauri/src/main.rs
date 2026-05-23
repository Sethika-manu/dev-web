// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::sync::Mutex;
use sysinfo::System;
use tauri::webview::{DownloadEvent, PageLoadEvent, WebviewBuilder};
// NEW: Theme enum එක import කරා OS level එකෙන් Theme එක force කරන්න
use tauri::{Emitter, LogicalPosition, LogicalSize, Manager, Runtime, Theme};

struct SystemState(Mutex<System>);

#[derive(Serialize)]
struct Metrics {
    cpu: f32,
    ram: u64,
    ping: u64,
}

#[tauri::command]
async fn open_webview<R: Runtime>(
    window: tauri::Window<R>,
    label: String,
    url: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    theme: String,
) -> Result<(), String> {
    if let Some(existing) = window.get_webview(&label) {
        let _ = existing.close();
    }

    // 1. NATIVE THEME ENFORCEMENT ON STARTUP
    // මේකෙන් තමයි මුළු Webview එකටම prefers-color-scheme එක Native විදියට යවන්නේ
    let tauri_theme = if theme == "dark" {
        Some(Theme::Dark)
    } else {
        Some(Theme::Light)
    };
    let _ = window.set_theme(tauri_theme);

    let url_parsed = tauri::Url::parse(&url).map_err(|e| format!("Invalid URL: {}", e))?;

    let mut app_cache_dir = window
        .app_handle()
        .path()
        .app_cache_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("cache"));
    app_cache_dir.push("webview_data");

    // JS Fallback for stubborn sites like YouTube
    let init_script = format!(
        r#"
        window.addEventListener('keydown', (e) => {{
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {{
                e.preventDefault();
                if (window.__TAURI_INTERNALS__) {{
                    window.__TAURI_INTERNALS__.invoke('emit_shortcut_event', {{ key: 'k' }});
                }} else if (window.__TAURI__) {{
                    window.__TAURI__.event.emit('shortcut-event', {{ key: 'k' }});
                }}
            }}
        }});
        
        function notifyNav() {{
            if (window.__TAURI_INTERNALS__) {{
                window.__TAURI_INTERNALS__.invoke('emit_spa_nav', {{ label: '{}' }});
            }}
        }}

        let lastTitle = document.title;
        const observer = new MutationObserver(() => {{
            if (document.title !== lastTitle) {{
                lastTitle = document.title;
                notifyNav();
            }}
        }});

        const startObserver = () => {{
            const titleEl = document.querySelector('title');
            if (titleEl) {{
                observer.observe(titleEl, {{ subtree: true, characterData: true, childList: true }});
                observer.observe(document.head, {{ childList: true }});
            }} else {{
                setTimeout(startObserver, 500);
            }}
        }};
        
        document.addEventListener('DOMContentLoaded', startObserver);
        startObserver();

        // Stubborn sites JS enforcer
        window.__RC_THEME__ = '{}';
        function enforceTheme() {{
            if (window.__RC_THEME__ === 'light') {{
                document.documentElement.removeAttribute('dark');
                document.documentElement.classList.remove('dark');
                document.documentElement.style.colorScheme = 'light';
            }} else {{
                document.documentElement.setAttribute('dark', 'true');
                document.documentElement.classList.add('dark');
                document.documentElement.style.colorScheme = 'dark';
            }}
        }}
        enforceTheme();
    "#,
        label, theme
    );

    let builder = WebviewBuilder::new(&label, tauri::WebviewUrl::External(url_parsed.clone()))
        .data_directory(app_cache_dir)
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .devtools(true)
        .accept_first_mouse(true)
        .initialization_script(&init_script);

    let window_clone = window.clone();
    let builder = builder.on_download(move |_webview, event| {
        match event {
            DownloadEvent::Requested { url, destination: _ } => {
                #[derive(serde::Serialize, Clone)]
                struct Payload { url: String, state: String, path: String }
                let _ = window_clone.emit("download-event", Payload { url: url.to_string(), state: "started".into(), path: "".into() });
                true 
            }
            DownloadEvent::Finished { url, path, success } => {
                #[derive(serde::Serialize, Clone)]
                struct Payload { url: String, state: String, path: String }
                let _ = window_clone.emit("download-event", Payload {
                    url: url.to_string(),
                    state: if success { "finished".into() } else { "failed".into() },
                    path: path.map_or("".to_string(), |p| p.to_string_lossy().into_owned()),
                });
                true
            }
            _ => true,
        }
    });

    let window_clone2 = window.clone();
    let builder = builder.on_page_load(move |webview, payload| {
        #[derive(serde::Serialize, Clone)]
        struct LoadPayload { label: String, url: String, state: String }
        let state = match payload.event() {
            PageLoadEvent::Started => "started",
            PageLoadEvent::Finished => "finished",
        };
        let _ = window_clone2.emit("page-load-event", LoadPayload {
            label: webview.label().to_string(),
            url: payload.url().to_string(),
            state: state.to_string(),
        });
    });

    window.add_child(builder, LogicalPosition::new(x, y), LogicalSize::new(width, height)).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn set_webview_theme<R: tauri::Runtime>(
    window: tauri::Window<R>,
    label: String,
    theme: String,
) -> Result<(), String> {
    
    // 1. NATIVE THEME SWITCHING (This is the magic that fixes prefers-color-scheme)
    let tauri_theme = if theme == "dark" {
        Some(Theme::Dark)
    } else {
        Some(Theme::Light)
    };
    let _ = window.set_theme(tauri_theme);

    // 2. JS Fallback execution
    if let Some(webview) = window.get_webview(&label) {
        let js = format!(
            r#"
            window.__RC_THEME__ = '{}';
            if (window.__RC_THEME__ === 'dark') {{
                document.documentElement.setAttribute('dark', 'true');
                document.documentElement.classList.add('dark');
                document.cookie = 'PREF=f6=400; domain=.youtube.com; path=/';
                document.documentElement.style.colorScheme = 'dark';
            }} else {{
                document.documentElement.removeAttribute('dark');
                document.documentElement.classList.remove('dark');
                document.cookie = 'PREF=f6=0; domain=.youtube.com; path=/';
                document.documentElement.style.colorScheme = 'light';
            }}
            "#,
            theme
        );
        webview.eval(&js).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Webview not found".to_string())
    }
}

#[tauri::command]
async fn navigate_webview<R: tauri::Runtime>(window: tauri::Window<R>, label: String, url: String) -> Result<(), String> {
    if let Some(webview) = window.get_webview(&label) {
        let url_parsed = tauri::Url::parse(&url).map_err(|e| format!("Invalid URL: {}", e))?;
        webview.navigate(url_parsed).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Webview not found".to_string())
    }
}

#[tauri::command]
async fn set_webview_visibility<R: tauri::Runtime>(window: tauri::Window<R>, label: String, visible: bool) -> Result<(), String> {
    if let Some(webview) = window.get_webview(&label) {
        if visible {
            webview.show().map_err(|e| e.to_string())?;
            webview.set_focus().map_err(|e| e.to_string())?;
        } else {
            webview.hide().map_err(|e| e.to_string())?;
        }
        Ok(())
    } else {
        Err("Webview not found".to_string())
    }
}

#[tauri::command]
async fn close_webview<R: tauri::Runtime>(window: tauri::Window<R>, label: String) -> Result<(), String> {
    if let Some(webview) = window.get_webview(&label) {
        webview.close().map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Ok(())
    }
}

#[tauri::command]
async fn set_webview_bounds<R: tauri::Runtime>(window: tauri::Window<R>, label: String, x: f64, y: f64, width: f64, height: f64) -> Result<(), String> {
    if let Some(webview) = window.get_webview(&label) {
        webview.set_position(LogicalPosition::new(x, y)).map_err(|e| e.to_string())?;
        webview.set_size(LogicalSize::new(width, height)).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Webview not found".to_string())
    }
}

#[tauri::command]
async fn go_back<R: tauri::Runtime>(window: tauri::Window<R>, label: String) -> Result<(), String> {
    if let Some(webview) = window.get_webview(&label) {
        webview.eval("window.history.back()").map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Webview not found".to_string())
    }
}

#[tauri::command]
async fn go_forward<R: tauri::Runtime>(window: tauri::Window<R>, label: String) -> Result<(), String> {
    if let Some(webview) = window.get_webview(&label) {
        webview.eval("window.history.forward()").map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Webview not found".to_string())
    }
}

#[tauri::command]
async fn reload_webview<R: tauri::Runtime>(window: tauri::Window<R>, label: String) -> Result<(), String> {
    if let Some(webview) = window.get_webview(&label) {
        webview.eval("window.location.reload()").map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Webview not found".to_string())
    }
}

#[tauri::command]
async fn emit_spa_nav<R: tauri::Runtime>(window: tauri::Window<R>, label: String) -> Result<(), String> {
    #[derive(serde::Serialize, Clone)]
    struct Payload { label: String }
    let _ = window.emit("spa-navigation", Payload { label });
    Ok(())
}

#[tauri::command]
async fn emit_shortcut_event<R: tauri::Runtime>(window: tauri::Window<R>, key: String) -> Result<(), String> {
    #[derive(serde::Serialize, Clone)]
    struct Payload { key: String }
    let _ = window.emit("shortcut-event", Payload { key });
    Ok(())
}

#[tauri::command]
async fn get_system_metrics(state: tauri::State<'_, SystemState>) -> Result<Metrics, String> {
    let mut sys = state.0.lock().unwrap();
    let pid = sysinfo::get_current_pid().unwrap();
    sys.refresh_process(pid);

    let mut cpu_usage = 0.0;
    let mut used_memory = 0;

    if let Some(process) = sys.process(pid) {
        cpu_usage = process.cpu_usage();
        used_memory = process.memory() / 1024 / 1024;
    }

    let ping = 24 + (std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs() % 10);
    Ok(Metrics { cpu: cpu_usage, ram: used_memory, ping })
}

fn main() {
    let mut sys = System::new_all();
    sys.refresh_all();

    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            #[cfg(target_os = "windows")]
            {
                let main_window = app.get_webview_window("main").unwrap();
                if let Some(icon) = app.default_window_icon() {
                    main_window.set_icon(icon.clone()).unwrap();
                }
            }
            Ok(())
        })
        .manage(SystemState(Mutex::new(sys)))
        .invoke_handler(tauri::generate_handler![
            open_webview,
            set_webview_theme,
            navigate_webview,
            close_webview,
            set_webview_visibility,
            set_webview_bounds,
            go_back,
            go_forward,
            reload_webview,
            emit_spa_nav,
            emit_shortcut_event,
            get_system_metrics
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}