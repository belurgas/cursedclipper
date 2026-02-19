// Public Tauri commands exported to frontend tooling API.
use super::*;

#[tauri::command]
pub fn get_runtime_tools_settings(app: AppHandle) -> Result<RuntimeToolsSettings, String> {
    load_settings(&app)
}

#[tauri::command]
pub fn save_runtime_tools_settings(
    app: AppHandle,
    settings: RuntimeToolsSettings,
) -> Result<RuntimeToolsSettings, String> {
    save_settings_internal(&app, settings)
}

#[tauri::command]
pub fn get_runtime_tools_status(app: AppHandle) -> Result<RuntimeToolsStatus, String> {
    let settings = load_settings(&app)?;
    Ok(build_runtime_status(&app, settings))
}

#[tauri::command]
pub fn pick_projects_root_dir() -> Result<Option<String>, String> {
    Ok(rfd::FileDialog::new()
        .pick_folder()
        .map(|path| path.to_string_lossy().to_string()))
}

#[tauri::command]
pub fn pick_local_video_file() -> Result<Option<String>, String> {
    Ok(rfd::FileDialog::new()
        .add_filter(
            "Video",
            &[
                "mp4", "mov", "mkv", "webm", "m4v", "avi", "wmv", "mpeg", "mpg",
            ],
        )
        .pick_file()
        .map(|path| path.to_string_lossy().to_string()))
}

#[tauri::command]
pub fn pick_local_cover_image_file() -> Result<Option<String>, String> {
    Ok(rfd::FileDialog::new()
        .add_filter("Image", &["png", "jpg", "jpeg", "webp"])
        .pick_file()
        .map(|path| path.to_string_lossy().to_string()))
}

#[tauri::command]
pub fn open_projects_root_dir(app: AppHandle) -> Result<String, String> {
    let settings = load_settings(&app)?;
    let projects_root = resolve_projects_root_dir(&app, &settings)?;
    open_in_file_manager(&projects_root)?;
    Ok(projects_root.to_string_lossy().to_string())
}

#[tauri::command]
pub fn open_path_in_file_manager(app: AppHandle, path: String) -> Result<String, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Path is missing.".to_string());
    }
    if trimmed.len() > 1024 {
        return Err("Path is too long.".to_string());
    }

    let candidate = PathBuf::from(trimmed);
    let target = if candidate.is_file() {
        candidate
            .parent()
            .map(Path::to_path_buf)
            .ok_or_else(|| "Failed to resolve file directory.".to_string())?
    } else {
        candidate
    };

    if !target.exists() {
        return Err("Specified path does not exist.".to_string());
    }
    let target = canonicalize_existing_path(&target)?;

    let settings = load_settings(&app)?;
    let projects_root = resolve_projects_root_dir(&app, &settings)?;
    let allowed_roots = [
        canonicalize_existing_path(&projects_root)?,
        canonicalize_existing_path(&app_data_dir(&app)?)?,
        canonicalize_existing_path(&app_config_dir(&app)?)?,
    ];

    let allowed = allowed_roots.iter().any(|root| target.starts_with(root));
    if !allowed {
        return Err(
            "Opening arbitrary paths is not allowed. Only project/app directories are allowed."
                .to_string(),
        );
    }

    open_in_file_manager(&target)?;
    Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn stage_local_video_file(
    app: AppHandle,
    source_path: String,
    project_name: Option<String>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        stage_local_video_file_sync(app, source_path, project_name)
    })
    .await
    .map_err(|error| format!("Local video import background task failed: {error}"))?
}

#[tauri::command]
pub async fn install_or_update_managed_ytdlp(app: AppHandle) -> Result<ToolStatus, String> {
    let app_for_task = app.clone();
    tauri::async_runtime::spawn_blocking(move || install_managed_ytdlp_sync(app_for_task))
        .await
        .map_err(|error| format!("yt-dlp background task failed: {error}"))?
        .inspect_err(|error| {
            emit_install_progress(&app, "ytdlp", "error", error, None);
        })
}

#[tauri::command]
pub async fn install_or_update_managed_ffmpeg(
    app: AppHandle,
) -> Result<RuntimeToolsStatus, String> {
    let app_for_task = app.clone();
    tauri::async_runtime::spawn_blocking(move || install_managed_ffmpeg_sync(app_for_task))
        .await
        .map_err(|error| format!("FFmpeg background task failed: {error}"))?
        .inspect_err(|error| {
            emit_install_progress(&app, "ffmpeg", "error", error, None);
        })
}

#[tauri::command]
pub async fn probe_youtube_formats(
    app: AppHandle,
    url: String,
) -> Result<YoutubeProbeResult, String> {
    tauri::async_runtime::spawn_blocking(move || probe_youtube_sync(app, url))
        .await
        .map_err(|error| format!("Probe background task failed: {error}"))?
}

#[tauri::command]
pub async fn download_youtube_media(
    app: AppHandle,
    request: YoutubeDownloadRequest,
) -> Result<YoutubeDownloadResult, String> {
    let task_key = request
        .task_id
        .clone()
        .and_then(|value| sanitize_optional_path(Some(value)).ok().flatten())
        .unwrap_or_else(|| "youtube-download".to_string());
    let app_for_task = app.clone();
    tauri::async_runtime::spawn_blocking(move || download_youtube_sync(app_for_task, request))
        .await
        .map_err(|error| format!("Download background task failed: {error}"))?
        .inspect_err(|error| {
            emit_install_progress_with_detail(
                &app,
                &task_key,
                "error",
                "YouTube import failed.",
                Some(error.clone()),
                None,
            );
        })
}

#[tauri::command]
pub async fn export_clips_batch(
    app: AppHandle,
    request: ClipBatchExportRequest,
) -> Result<ClipBatchExportResult, String> {
    tauri::async_runtime::spawn_blocking(move || export_clips_batch_sync(app, request))
        .await
        .map_err(|error| format!("Batch export background task failed: {error}"))?
}
