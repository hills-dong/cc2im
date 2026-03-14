#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::sync::Arc;
use std::sync::atomic::{AtomicU16, Ordering};
use tauri::{
    Manager,
    menu::{Menu, MenuItem},
    tray::{TrayIcon, TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState},
};

fn main() {
    let port = Arc::new(AtomicU16::new(0));
    let port_clone = port.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(move |app| {
            // Start Node.js server
            let mut child = Command::new("node")
                .args(["packages/cli/dist/cli.js", "web", "--port", "0", "--bind", "127.0.0.1"])
                .stdout(Stdio::piped())
                .stderr(Stdio::inherit())
                .spawn()
                .expect("Failed to start Node.js server");

            // Read stdout to find the listening port
            if let Some(stdout) = child.stdout.take() {
                let reader = BufReader::new(stdout);
                for line in reader.lines() {
                    if let Ok(line) = line {
                        // Look for port in output like "cc2im server listening on 127.0.0.1:12345"
                        if let Some(port_str) = line.rsplit(':').next() {
                            if let Ok(p) = port_str.trim().parse::<u16>() {
                                port_clone.store(p, Ordering::SeqCst);
                                break;
                            }
                        }
                    }
                }
            }

            let actual_port = port_clone.load(Ordering::SeqCst);
            if actual_port > 0 {
                if let Some(window) = app.get_webview_window("main") {
                    let url = format!("http://127.0.0.1:{}", actual_port);
                    let _ = window.navigate(url.parse().unwrap());
                }
            }

            // System tray
            let open_item = MenuItem::with_id(app, "open", "Open cc2im", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open_item, &quit_item])?;

            let _tray = TrayIconBuilder::new()
                .menu(&menu)
                .on_menu_event(|app, event| {
                    match event.id().as_ref() {
                        "open" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => {
                            std::process::exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
