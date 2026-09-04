use std::str::FromStr;

use serde::{Deserialize, Serialize};
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder, Wry,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_store::StoreExt;

const STORE_FILE: &str = "settings.json";
const KEY_LEVEL: &str = "level";
const KEY_HOTKEY: &str = "hotkey";
const NOTE_FILE: &str = "note.md";

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Level {
    Top,
    Normal,
    Bottom,
}

struct TrayItems {
    top: CheckMenuItem<Wry>,
    normal: CheckMenuItem<Wry>,
    bottom: CheckMenuItem<Wry>,
}

// ---------- store helpers ----------

fn store_get<T: for<'de> Deserialize<'de>>(app: &AppHandle, key: &str) -> Option<T> {
    let store = app.store(STORE_FILE).ok()?;
    let v = store.get(key)?;
    serde_json::from_value(v).ok()
}

fn store_set<T: Serialize>(app: &AppHandle, key: &str, value: T) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    store.set(key, serde_json::to_value(value).map_err(|e| e.to_string())?);
    store.save().map_err(|e| e.to_string())
}

fn store_delete(app: &AppHandle, key: &str) -> Result<(), String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    store.delete(key);
    store.save().map_err(|e| e.to_string())
}

// ---------- window level ----------

fn current_level(app: &AppHandle) -> Level {
    store_get::<Level>(app, KEY_LEVEL).unwrap_or(Level::Top)
}

fn apply_level(app: &AppHandle, level: Level) -> Result<(), String> {
    let win = app.get_webview_window("main").ok_or("main window not found")?;
    match level {
        Level::Top => {
            win.set_always_on_bottom(false).map_err(|e| e.to_string())?;
            win.set_always_on_top(true).map_err(|e| e.to_string())?;
        }
        Level::Normal => {
            win.set_always_on_top(false).map_err(|e| e.to_string())?;
            win.set_always_on_bottom(false).map_err(|e| e.to_string())?;
        }
        Level::Bottom => {
            win.set_always_on_top(false).map_err(|e| e.to_string())?;
            win.set_always_on_bottom(true).map_err(|e| e.to_string())?;
        }
    }
    store_set(app, KEY_LEVEL, level)?;
    if let Some(items) = app.try_state::<TrayItems>() {
        let _ = items.top.set_checked(level == Level::Top);
        let _ = items.normal.set_checked(level == Level::Normal);
        let _ = items.bottom.set_checked(level == Level::Bottom);
    }
    let _ = app.emit("level-changed", level);
    Ok(())
}

fn bring_to_front(app: &AppHandle) {
    let _ = apply_level(app, Level::Top);
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

// ---------- hotkey ----------

fn register_hotkey(app: &AppHandle, hotkey: &str) -> Result<(), String> {
    let shortcut = Shortcut::from_str(hotkey).map_err(|e| format!("無効なショートカット: {e}"))?;
    app.global_shortcut()
        .register(shortcut)
        .map_err(|e| format!("登録に失敗: {e}"))
}

// ---------- commands ----------

#[tauri::command]
fn get_level(app: AppHandle) -> Level {
    current_level(&app)
}

#[tauri::command]
fn set_level(app: AppHandle, level: Level) -> Result<(), String> {
    apply_level(&app, level)
}

#[tauri::command]
fn get_hotkey(app: AppHandle) -> Option<String> {
    store_get::<String>(&app, KEY_HOTKEY)
}

#[tauri::command]
fn set_hotkey(app: AppHandle, hotkey: Option<String>) -> Result<(), String> {
    let previous = store_get::<String>(&app, KEY_HOTKEY);
    app.global_shortcut()
        .unregister_all()
        .map_err(|e| e.to_string())?;

    match hotkey {
        Some(hk) if !hk.trim().is_empty() => {
            if let Err(e) = register_hotkey(&app, &hk) {
                if let Some(prev) = previous {
                    let _ = register_hotkey(&app, &prev);
                }
                return Err(e);
            }
            store_set(&app, KEY_HOTKEY, hk)?;
        }
        _ => {
            store_delete(&app, KEY_HOTKEY)?;
        }
    }
    let _ = app.emit("hotkey-changed", store_get::<String>(&app, KEY_HOTKEY));
    Ok(())
}

fn note_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(NOTE_FILE))
}

#[tauri::command]
fn get_note_path(app: AppHandle) -> Result<String, String> {
    Ok(note_path(&app)?.to_string_lossy().into_owned())
}

#[tauri::command]
fn load_note(app: AppHandle) -> Result<String, String> {
    let path = note_path(&app)?;
    match std::fs::read_to_string(&path) {
        Ok(s) => Ok(s),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn save_note(app: AppHandle, content: String) -> Result<(), String> {
    let path = note_path(&app)?;
    let tmp = path.with_extension("md.tmp");
    std::fs::write(&tmp, content).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

#[tauri::command]
fn open_settings(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("settings") {
        win.show().map_err(|e| e.to_string())?;
        win.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }
    WebviewWindowBuilder::new(&app, "settings", WebviewUrl::App("settings.html".into()))
        .title("FloatNote 設定")
        .inner_size(440.0, 320.0)
        .resizable(false)
        .always_on_top(true)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ---------- tray ----------

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let level = current_level(app);
    let show = MenuItem::with_id(app, "show", "ノートを表示", true, None::<&str>)?;
    let top = CheckMenuItem::with_id(app, "level_top", "常に最前面", true, level == Level::Top, None::<&str>)?;
    let normal = CheckMenuItem::with_id(app, "level_normal", "通常", true, level == Level::Normal, None::<&str>)?;
    let bottom = CheckMenuItem::with_id(app, "level_bottom", "常に最奥", true, level == Level::Bottom, None::<&str>)?;
    let level_menu = Submenu::with_items(app, "ウィンドウ位置", true, &[&top, &normal, &bottom])?;
    let settings = MenuItem::with_id(app, "settings", "設定...", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "FloatNote を終了", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&show, &sep, &level_menu, &settings, &sep2, &quit])?;

    app.manage(TrayItems { top, normal, bottom });

    TrayIconBuilder::with_id("tray")
        .icon(tauri::image::Image::from_bytes(include_bytes!("../icons/tray@2x.png"))?)
        .icon_as_template(true)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("FloatNote")
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => bring_to_front(app),
            "level_top" => { let _ = apply_level(app, Level::Top); }
            "level_normal" => { let _ = apply_level(app, Level::Normal); }
            "level_bottom" => { let _ = apply_level(app, Level::Bottom); }
            "settings" => { let _ = open_settings(app.clone()); }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                let app = tray.app_handle();
                if let Some(win) = app.get_webview_window("main") {
                    if win.is_visible().unwrap_or(false) && win.is_focused().unwrap_or(false) {
                        let _ = win.hide();
                    } else {
                        bring_to_front(app);
                    }
                }
            }
        })
        .build(app)?;
    Ok(())
}

// ---------- entry ----------

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(
            tauri_plugin_window_state::Builder::new()
                // remember size & position of the note window only; visibility is managed by us
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::SIZE
                        | tauri_plugin_window_state::StateFlags::POSITION,
                )
                .with_denylist(&["settings"])
                .build(),
        )
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        bring_to_front(app);
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            get_level, set_level, get_hotkey, set_hotkey, load_note, save_note, get_note_path, open_settings
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            build_tray(&handle)?;
            let _ = apply_level(&handle, current_level(&handle));
            if let Some(hk) = store_get::<String>(&handle, KEY_HOTKEY) {
                if let Err(e) = register_hotkey(&handle, &hk) {
                    eprintln!("hotkey restore failed: {e}");
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // Dock icon click / re-open: bring the note back to the front
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = event {
                bring_to_front(app);
            }
            let _ = (app, &event);
        });
}
