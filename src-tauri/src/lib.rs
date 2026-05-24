use tauri::{AppHandle, Manager};

// Desktop වලට විතරක් ඕන කරන Imports
#[cfg(desktop)]
use tauri::{WebviewBuilder, PhysicalPosition, PhysicalSize};

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
    // මේ කොටස වැඩ කරන්නේ PC (Windows/Mac) වල විතරයි
    #[cfg(desktop)]
    {
        let main_window = app.get_window("main").or_else(|| app.get_window("main_window")).ok_or("Main window not found")?;
        let url_data = url.parse().map_err(|e| format!("Invalid URL: {}", e))?;

        if let Some(webview) = app.get_webview(&label) {
            let _ = webview.navigate(url_data);
            let _ = webview.set_position(PhysicalPosition::new(x as i32, y as i32));
            let _ = webview.set_size(PhysicalSize::new(width as u32, height as u32));
            return Ok(());
        }

        let webview_builder = WebviewBuilder::new(&label, tauri::WebviewUrl::External(url_data));
        
        main_window.add_child(
            webview_builder,
            PhysicalPosition::new(x as i32, y as i32),
            PhysicalSize::new(width as u32, height as u32),
        ).map_err(|e| format!("Failed to create webview: {}", e))?;

        if let Some(webview) = app.get_webview(&label) {
            let js = if theme == "dark" { "document.documentElement.classList.add('dark');" } else { "document.documentElement.classList.remove('dark');" };
            let _ = webview.eval(js);
        }
    }

    // මේ කොටස වැඩ කරන්නේ Mobile (Android/iOS) වල විතරයි
    #[cfg(mobile)]
    {
        // Android වලට Child Webviews සපෝට් නැති නිසා අපි දැනට Error එකක් එන්නේ නැති වෙන්න මේක හිස්ව තියනවා.
        println!("Child webviews loading is bypassed on Android.");
    }

    Ok(())
}

#[tauri::command]
async fn close_webview(app: AppHandle, label: String) -> Result<(), String> {
    #[cfg(desktop)]
    {
        if let Some(webview) = app.get_webview(&label) {
            webview.close().map_err(|e| format!("Failed to close webview: {}", e))?;
        }
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
    Ok(())
}

#[tauri::command]
async fn set_webview_theme(app: AppHandle, label: String, theme: String) -> Result<(), String> {
    #[cfg(desktop)]
    {
        if let Some(webview) = app.get_webview(&label) {
            let js = if theme == "dark" { "document.documentElement.classList.add('dark');" } else { "document.documentElement.classList.remove('dark');" };
            let _ = webview.eval(js);
        }
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            open_webview,
            close_webview,
            set_webview_bounds,
            set_webview_theme
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}