// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // අර Cargo.toml එකේ අපි "app_lib" කියලා දුන්න නම තමයි මෙතන තියෙන්නේ
    app_lib::run();
}
