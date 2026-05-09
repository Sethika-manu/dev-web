// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{LogicalPosition, LogicalSize, Runtime, Manager};
use tauri::webview::WebviewBuilder;

#[tauri::command]
async fn open_webview<R: Runtime>(
    window: tauri::Window<R>,
    label: String,
    url: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    // Close existing if any with same label (rare but safe)
    if let Some(existing) = window.get_webview(&label) {
        let _ = existing.close();
    }

    let url_parsed = tauri::Url::parse(&url).map_err(|e| format!("Invalid URL: {}", e))?;
    
    let builder = WebviewBuilder::new(&label, tauri::WebviewUrl::External(url_parsed.clone()))
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .devtools(true)
        .accept_first_mouse(true)
        .initialization_script(r#"
            window.addEventListener('keydown', (e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                    e.preventDefault();
                    window.__TAURI__.event.emit('shortcut-event', { key: 'k' });
                }
            });
        "#);

    window.add_child(
        builder,
        LogicalPosition::new(x, y),
        LogicalSize::new(width, height),
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn navigate_webview<R: tauri::Runtime>(
    window: tauri::Window<R>,
    label: String,
    url: String,
) -> Result<(), String> {
    if let Some(webview) = window.get_webview(&label) {
        let url_parsed = tauri::Url::parse(&url).map_err(|e| format!("Invalid URL: {}", e))?;
        webview.navigate(url_parsed).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Webview not found".to_string())
    }
}

#[tauri::command]
async fn set_webview_visibility<R: tauri::Runtime>(
    window: tauri::Window<R>,
    label: String,
    visible: bool,
) -> Result<(), String> {
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
async fn close_webview<R: tauri::Runtime>(
    window: tauri::Window<R>,
    label: String,
) -> Result<(), String> {
    if let Some(webview) = window.get_webview(&label) {
        webview.close().map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Ok(())
    }
}

#[tauri::command]
async fn set_webview_bounds<R: tauri::Runtime>(
    window: tauri::Window<R>,
    label: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    if let Some(webview) = window.get_webview(&label) {
        webview.set_position(LogicalPosition::new(x, y)).map_err(|e| e.to_string())?;
        webview.set_size(LogicalSize::new(width, height)).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Webview not found".to_string())
    }
}

#[tauri::command]
async fn go_back<R: tauri::Runtime>(
    window: tauri::Window<R>,
    label: String,
) -> Result<(), String> {
    if let Some(webview) = window.get_webview(&label) {
        webview.eval("window.history.back()").map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Webview not found".to_string())
    }
}

#[tauri::command]
async fn go_forward<R: tauri::Runtime>(
    window: tauri::Window<R>,
    label: String,
) -> Result<(), String> {
    if let Some(webview) = window.get_webview(&label) {
        webview.eval("window.history.forward()").map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Webview not found".to_string())
    }
}

fn main() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
        open_webview, 
        navigate_webview, 
        close_webview,
        set_webview_visibility,
        set_webview_bounds,
        go_back,
        go_forward
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
