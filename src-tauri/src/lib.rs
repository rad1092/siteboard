mod workspace;

use tauri::{Emitter, Manager};
#[cfg(debug_assertions)]
use tauri::{WebviewUrl, WebviewWindowBuilder};
use workspace::{DesktopProjectFile, DesktopRuntimeStatus, DesktopWorkspaceLoad, WorkspaceManager};

#[tauri::command]
fn desktop_runtime_status(manager: tauri::State<'_, WorkspaceManager>) -> DesktopRuntimeStatus {
    manager.status()
}

#[tauri::command]
fn desktop_load_workspace(
    manager: tauri::State<'_, WorkspaceManager>,
) -> Result<Option<DesktopWorkspaceLoad>, String> {
    manager.load_workspace().map_err(|error| error.to_string())
}

#[tauri::command]
fn desktop_read_project(
    path: String,
    manager: tauri::State<'_, WorkspaceManager>,
) -> Result<DesktopProjectFile, String> {
    manager
        .read_project(path)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn desktop_use_project(
    path: String,
    manager: tauri::State<'_, WorkspaceManager>,
) -> Result<DesktopRuntimeStatus, String> {
    manager.use_project(path).map_err(|error| error.to_string())
}

#[tauri::command]
fn desktop_new_project(
    manager: tauri::State<'_, WorkspaceManager>,
) -> Result<DesktopRuntimeStatus, String> {
    manager.new_project().map_err(|error| error.to_string())
}

#[tauri::command]
fn desktop_save_project(
    content: String,
    allow_unsafe_replacement: bool,
    manager: tauri::State<'_, WorkspaceManager>,
) -> Result<DesktopRuntimeStatus, String> {
    manager
        .save_active(&content, allow_unsafe_replacement)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn desktop_save_project_to(
    path: String,
    content: String,
    manager: tauri::State<'_, WorkspaceManager>,
) -> Result<DesktopRuntimeStatus, String> {
    manager
        .save_to(path, &content)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn desktop_write_archive(
    path: String,
    bytes: Vec<u8>,
    manager: tauri::State<'_, WorkspaceManager>,
) -> Result<String, String> {
    manager
        .write_archive(path, &bytes)
        .map(|path| path.to_string_lossy().into_owned())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn desktop_write_recovery_export(
    path: String,
    content: String,
    manager: tauri::State<'_, WorkspaceManager>,
) -> Result<String, String> {
    manager
        .write_recovery_export(path, &content)
        .map(|path| path.to_string_lossy().into_owned())
        .map_err(|error| error.to_string())
}

fn focus_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            focus_main_window(app);
            if let Some(path) = args
                .iter()
                .skip(1)
                .find(|arg| arg.ends_with(".siteboard") || arg.ends_with(".siteboard.json"))
            {
                if let Some(manager) = app.try_state::<WorkspaceManager>() {
                    let requested = std::path::PathBuf::from(path);
                    let requested = if requested.is_absolute() {
                        requested
                    } else {
                        std::path::PathBuf::from(cwd).join(requested)
                    };
                    match manager.read_project(requested) {
                        Ok(project) => {
                            let _ = app.emit("desktop-project-open-requested", project);
                        }
                        Err(error) => {
                            let _ = app.emit("desktop-project-open-failed", error.to_string());
                        }
                    }
                }
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_data = app.path().app_data_dir()?;
            let manager = WorkspaceManager::new(app_data)?;
            if let Some(path) = std::env::args()
                .skip(1)
                .find(|arg| arg.ends_with(".siteboard") || arg.ends_with(".siteboard.json"))
            {
                let _ = manager.use_project(path);
            }
            app.manage(manager);

            #[cfg(debug_assertions)]
            if app.get_webview_window("main").is_none() {
                WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                    .title("Siteboard")
                    .build()?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            desktop_runtime_status,
            desktop_load_workspace,
            desktop_read_project,
            desktop_use_project,
            desktop_new_project,
            desktop_save_project,
            desktop_save_project_to,
            desktop_write_archive,
            desktop_write_recovery_export,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Siteboard");
}
