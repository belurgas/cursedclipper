mod backend;
mod tooling;

use tauri::Manager;

#[cfg(target_os = "macos")]
fn ensure_macos_shell_like_path() {
    use std::collections::BTreeSet;
    use std::env;
    use std::ffi::OsString;
    use std::fs;

    let mut ordered_paths: Vec<String> = vec![
        "/opt/homebrew/bin".to_string(),
        "/usr/local/bin".to_string(),
        "/usr/bin".to_string(),
        "/bin".to_string(),
        "/usr/sbin".to_string(),
        "/sbin".to_string(),
    ];

    if let Ok(paths_file) = fs::read_to_string("/etc/paths") {
        for line in paths_file.lines() {
            let trimmed = line.trim();
            if !trimmed.is_empty() {
                ordered_paths.push(trimmed.to_string());
            }
        }
    }

    let current = env::var("PATH").unwrap_or_default();
    for value in current.split(':') {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            ordered_paths.push(trimmed.to_string());
        }
    }

    let mut seen: BTreeSet<String> = BTreeSet::new();
    let deduped: Vec<String> = ordered_paths
        .into_iter()
        .filter(|entry| seen.insert(entry.clone()))
        .collect();

    let normalized = deduped.join(":");
    env::set_var("PATH", OsString::from(normalized));
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                // Finder-launched apps on macOS often get a minimal PATH, so
                // normalize it to include common Homebrew/system binary paths.
                ensure_macos_shell_like_path();
            }

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.center();
            }

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .level_for("tao", log::LevelFilter::Error)
                        .level_for("winit", log::LevelFilter::Error)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            backend::get_dashboard_data,
            backend::create_project_draft,
            backend::patch_project,
            backend::delete_project,
            backend::save_project_workspace_state,
            backend::load_project_workspace_state,
            backend::save_project_resume_state,
            backend::load_project_resume_state,
            backend::generate_workspace_mock,
            backend::regenerate_hooks,
            backend::regenerate_thumbnails,
            tooling::get_runtime_tools_settings,
            tooling::save_runtime_tools_settings,
            tooling::get_runtime_tools_status,
            tooling::pick_projects_root_dir,
            tooling::pick_local_video_file,
            tooling::pick_local_cover_image_file,
            tooling::open_projects_root_dir,
            tooling::open_path_in_file_manager,
            tooling::stage_local_video_file,
            tooling::install_or_update_managed_ytdlp,
            tooling::install_or_update_managed_ffmpeg,
            tooling::probe_youtube_formats,
            tooling::download_youtube_media,
            tooling::export_clips_batch
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
