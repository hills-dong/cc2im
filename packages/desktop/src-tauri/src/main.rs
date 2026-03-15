#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicU16, Ordering};
use tauri::{
    Manager,
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState},
};

/// Find the node binary, checking common locations since PATH is minimal when
/// launched from Finder / Dock on macOS.
fn find_node() -> Option<String> {
    let candidates = [
        "node",
        "/usr/local/bin/node",
        "/opt/homebrew/bin/node",
        "/opt/local/bin/node",
    ];
    for candidate in &candidates {
        if Command::new(candidate).arg("--version").output().is_ok() {
            return Some(candidate.to_string());
        }
    }
    // Also check NVM / fnm default locations
    if let Ok(home) = std::env::var("HOME") {
        let nvm_path = format!("{}/.nvm/versions/node", home);
        if let Ok(entries) = std::fs::read_dir(&nvm_path) {
            let mut versions: Vec<_> = entries.filter_map(|e| e.ok()).collect();
            versions.sort_by(|a, b| b.file_name().cmp(&a.file_name()));
            if let Some(latest) = versions.first() {
                let node = latest.path().join("bin/node");
                if node.exists() {
                    return Some(node.to_string_lossy().to_string());
                }
            }
        }
        let fnm_path = format!("{}/.local/share/fnm/node-versions", home);
        if let Ok(entries) = std::fs::read_dir(&fnm_path) {
            let mut versions: Vec<_> = entries.filter_map(|e| e.ok()).collect();
            versions.sort_by(|a, b| b.file_name().cmp(&a.file_name()));
            if let Some(latest) = versions.first() {
                let node = latest.path().join("installation/bin/node");
                if node.exists() {
                    return Some(node.to_string_lossy().to_string());
                }
            }
        }
    }
    None
}

/// Find the CLI entry point relative to the app bundle or working directory.
fn find_cli_script() -> Option<String> {
    // When running inside a .app bundle, the binary is at
    // <app>/Contents/MacOS/cc2im-desktop. The CLI is installed globally or
    // bundled alongside. Try common locations:
    let candidates = [
        // Development: relative to project root
        "packages/cli/dist/cli.js",
        // Installed globally via npm
        "cc2im",
    ];
    for candidate in &candidates {
        if std::path::Path::new(candidate).exists() {
            return Some(candidate.to_string());
        }
    }

    // Try to find cc2im in PATH-like locations
    let path_candidates = [
        "/usr/local/bin/cc2im",
        "/opt/homebrew/bin/cc2im",
    ];
    for candidate in &path_candidates {
        if std::path::Path::new(candidate).exists() {
            return Some(candidate.to_string());
        }
    }

    None
}

fn main() {
    let port = Arc::new(AtomicU16::new(0));
    let port_clone = port.clone();
    let child_process: Arc<Mutex<Option<Child>>> = Arc::new(Mutex::new(None));
    let child_for_exit = child_process.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(move |app| {
            // Try to start Node.js server (non-fatal if it fails)
            let server_error = match find_node() {
                None => Some("Node.js not found. Please install Node.js to use cc2im.".to_string()),
                Some(node_bin) => {
                    match find_cli_script() {
                        None => Some("cc2im CLI not found. Please install cc2im globally: npm install -g cc2im".to_string()),
                        Some(cli_script) => {
                            match Command::new(&node_bin)
                                .args([&cli_script, "web", "--port", "0", "--bind", "127.0.0.1"])
                                .stdout(Stdio::piped())
                                .stderr(Stdio::inherit())
                                .spawn()
                            {
                                Err(e) => Some(format!("Failed to start server: {}", e)),
                                Ok(mut child) => {
                                    // Read stdout to find the listening port
                                    if let Some(stdout) = child.stdout.take() {
                                        let reader = BufReader::new(stdout);
                                        for line in reader.lines() {
                                            if let Ok(line) = line {
                                                if let Some(port_str) = line.rsplit(':').next() {
                                                    if let Ok(p) = port_str.trim().parse::<u16>() {
                                                        port_clone.store(p, Ordering::SeqCst);
                                                        break;
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    if let Ok(mut guard) = child_process.lock() {
                                        *guard = Some(child);
                                    }
                                    None
                                }
                            }
                        }
                    }
                }
            };

            let actual_port = port_clone.load(Ordering::SeqCst);
            if let Some(window) = app.get_webview_window("main") {
                if actual_port > 0 {
                    let url = format!("http://127.0.0.1:{}", actual_port);
                    if let Ok(parsed) = url.parse() {
                        let _ = window.navigate(parsed);
                    }
                } else if let Some(err_msg) = &server_error {
                    // Show error in the webview
                    let html = format!(
                        "data:text/html,<html><body style='font-family:system-ui;padding:40px;text-align:center'>\
                        <h2>cc2im</h2><p style='color:red'>{}</p>\
                        <p>The desktop app needs a running cc2im server.</p></body></html>",
                        err_msg
                    );
                    if let Ok(parsed) = html.parse() {
                        let _ = window.navigate(parsed);
                    }
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

    // Clean up child process on exit
    if let Ok(mut guard) = child_for_exit.lock() {
        if let Some(ref mut child) = *guard {
            let _ = child.kill();
        }
    }
}
