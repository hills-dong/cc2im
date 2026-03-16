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

/// Parse a port number from a line like "cc2im web UI available at http://0.0.0.0:8080"
/// Looks for the last colon-separated segment and tries to parse it as u16.
fn parse_port_from_line(line: &str) -> Option<u16> {
    line.rsplit(':').next().and_then(|s| s.trim().parse::<u16>().ok())
}

fn main() {
    let port = Arc::new(AtomicU16::new(0));
    let port_clone = port.clone();
    let child_process: Arc<Mutex<Option<Child>>> = Arc::new(Mutex::new(None));

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
                                                if let Some(p) = parse_port_from_line(&line) {
                                                    port_clone.store(p, Ordering::SeqCst);
                                                    break;
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
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::os::unix::fs::PermissionsExt;

    // --- parse_port_from_line ---

    #[test]
    fn parse_port_typical_url() {
        assert_eq!(parse_port_from_line("cc2im web UI available at http://0.0.0.0:8080"), Some(8080));
    }

    #[test]
    fn parse_port_localhost() {
        assert_eq!(parse_port_from_line("listening on http://127.0.0.1:3000"), Some(3000));
    }

    #[test]
    fn parse_port_just_port() {
        assert_eq!(parse_port_from_line(":4567"), Some(4567));
    }

    #[test]
    fn parse_port_with_trailing_whitespace() {
        assert_eq!(parse_port_from_line("http://localhost:9090  "), Some(9090));
    }

    #[test]
    fn parse_port_no_port_in_line() {
        assert_eq!(parse_port_from_line("no port here"), None);
    }

    #[test]
    fn parse_port_empty_string() {
        assert_eq!(parse_port_from_line(""), None);
    }

    #[test]
    fn parse_port_colon_but_not_number() {
        assert_eq!(parse_port_from_line("key:value"), None);
    }

    #[test]
    fn parse_port_zero() {
        assert_eq!(parse_port_from_line(":0"), Some(0));
    }

    #[test]
    fn parse_port_overflow_u16() {
        // 70000 > u16::MAX (65535)
        assert_eq!(parse_port_from_line(":70000"), None);
    }

    // --- find_node ---

    #[test]
    fn find_node_returns_some_on_system_with_node() {
        // This test assumes node is installed (CI/dev environment)
        // If node is not installed, this test is allowed to return None
        let result = find_node();
        if which_exists("node") {
            assert!(result.is_some(), "node is in PATH but find_node returned None");
        }
    }

    fn which_exists(cmd: &str) -> bool {
        Command::new("which").arg(cmd).output().map(|o| o.status.success()).unwrap_or(false)
    }

    // --- find_cli_script ---

    #[test]
    fn find_cli_script_finds_local_dev_script() {
        // find_cli_script checks relative paths from CWD.
        // We test by changing to a temp dir with the expected structure.
        let tmp = tempfile::tempdir().unwrap();
        let cli_dir = tmp.path().join("packages/cli/dist");
        fs::create_dir_all(&cli_dir).unwrap();
        let script = cli_dir.join("cli.js");
        fs::write(&script, "// stub").unwrap();

        let prev_dir = std::env::current_dir().unwrap();
        std::env::set_current_dir(tmp.path()).unwrap();

        let result = find_cli_script();

        std::env::set_current_dir(&prev_dir).unwrap();
        assert_eq!(result, Some("packages/cli/dist/cli.js".to_string()));
    }

    #[test]
    fn find_cli_script_returns_none_in_empty_dir() {
        let tmp = tempfile::tempdir().unwrap();
        let prev_dir = std::env::current_dir().unwrap();
        std::env::set_current_dir(tmp.path()).unwrap();

        let result = find_cli_script();

        std::env::set_current_dir(&prev_dir).unwrap();
        // Should be None unless /usr/local/bin/cc2im or /opt/homebrew/bin/cc2im exists
        // We can't fully control system paths, but in most test envs this is None
        if !std::path::Path::new("/usr/local/bin/cc2im").exists()
            && !std::path::Path::new("/opt/homebrew/bin/cc2im").exists()
        {
            assert_eq!(result, None);
        }
    }
}
