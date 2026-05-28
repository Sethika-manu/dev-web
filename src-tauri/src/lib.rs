use serde::Serialize;
use std::net::{SocketAddr, TcpStream};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

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

fn get_ping() -> u64 {
    let start = Instant::now();
    let addr = "1.1.1.1:53".parse::<SocketAddr>().unwrap();
    if TcpStream::connect_timeout(&addr, Duration::from_millis(1000)).is_ok() {
        start.elapsed().as_millis() as u64
    } else {
        0
    }
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
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

        let webview_builder = WebviewBuilder::new(&label, tauri::WebviewUrl::External(url_data));

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
            let ram = process.memory() / 1024 / 1024; // Convert bytes to MB
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
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(SystemState(std::sync::Mutex::new(sysinfo::System::new_all())))
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
            resize_browser_webview
        ])
        .setup(|app| {
            use tauri::Listener;
            
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
