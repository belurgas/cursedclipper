use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager};
use url::Url;
use which::which;
use zip::ZipArchive;

const SETTINGS_FILE_NAME: &str = "runtime-tools.json";
const INSTALL_PROGRESS_EVENT: &str = "runtime-tools://install-progress";
const FFMPEG_WINDOWS_ESSENTIALS_URL: &str =
    "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip";
const FFMPEG_WINDOWS_FALLBACK_URL: &str =
    "https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeInstallProgressEvent {
    pub task: String,
    pub title: Option<String>,
    pub status: String,
    pub message: String,
    pub detail: Option<String>,
    pub progress: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeToolsSettings {
    pub ytdlp_mode: String,
    pub ytdlp_custom_path: Option<String>,
    pub ffmpeg_custom_path: Option<String>,
    pub ffprobe_custom_path: Option<String>,
    pub projects_root_dir: Option<String>,
    pub auto_update_ytdlp: bool,
    pub prefer_bundled_ffmpeg: bool,
}

impl Default for RuntimeToolsSettings {
    fn default() -> Self {
        Self {
            ytdlp_mode: "managed".to_string(),
            ytdlp_custom_path: None,
            ffmpeg_custom_path: None,
            ffprobe_custom_path: None,
            projects_root_dir: None,
            auto_update_ytdlp: true,
            prefer_bundled_ffmpeg: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolStatus {
    pub name: String,
    pub available: bool,
    pub source: String,
    pub path: Option<String>,
    pub version: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeToolsStatus {
    pub settings: RuntimeToolsSettings,
    pub ffmpeg: ToolStatus,
    pub ffprobe: ToolStatus,
    pub ytdlp: ToolStatus,
    pub ytdlp_system_available: bool,
    pub projects_dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YoutubeFormatOption {
    pub id: String,
    pub label: String,
    pub ext: String,
    pub resolution: String,
    pub fps: Option<f64>,
    pub filesize: Option<u64>,
    pub vcodec: String,
    pub acodec: String,
    pub audio_only: bool,
    pub video_only: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YoutubeProbeResult {
    pub title: String,
    pub uploader: Option<String>,
    pub duration: Option<f64>,
    pub thumbnail: Option<String>,
    pub view_count: Option<u64>,
    pub like_count: Option<u64>,
    pub comment_count: Option<u64>,
    pub upload_date: Option<String>,
    pub channel_id: Option<String>,
    pub channel_url: Option<String>,
    pub channel_followers: Option<u64>,
    pub formats: Vec<YoutubeFormatOption>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YoutubeDownloadRequest {
    pub url: String,
    pub format_id: String,
    pub video_only: Option<bool>,
    pub audio_only: Option<bool>,
    pub include_audio: Option<bool>,
    pub project_name: Option<String>,
    pub task_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YoutubeDownloadResult {
    pub output_path: String,
    pub source_url: String,
    pub format_id: String,
    pub duration_seconds: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipExportPlatformTask {
    pub clip_id: String,
    pub platform_id: String,
    pub aspect: String,
    pub start: f64,
    pub end: f64,
    pub title: Option<String>,
    pub description: Option<String>,
    pub tags: Option<String>,
    pub cover_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipBatchExportRequest {
    pub project_id: String,
    pub project_name: Option<String>,
    pub source_path: String,
    pub task_id: Option<String>,
    pub tasks: Vec<ClipExportPlatformTask>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipExportArtifact {
    pub clip_id: String,
    pub platform_id: String,
    pub output_path: String,
    pub duration_seconds: f64,
    pub cover_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipBatchExportResult {
    pub project_dir: String,
    pub exported_count: u32,
    pub artifacts: Vec<ClipExportArtifact>,
}

#[derive(Debug, Clone, Deserialize)]
struct YtdlpProbePayload {
    title: Option<String>,
    uploader: Option<String>,
    duration: Option<f64>,
    thumbnail: Option<String>,
    view_count: Option<u64>,
    like_count: Option<u64>,
    comment_count: Option<u64>,
    upload_date: Option<String>,
    channel_id: Option<String>,
    channel_url: Option<String>,
    channel_follower_count: Option<u64>,
    formats: Option<Vec<YtdlpProbeFormat>>,
}

#[derive(Debug, Clone, Deserialize)]
struct YtdlpProbeFormat {
    format_id: Option<String>,
    ext: Option<String>,
    format_note: Option<String>,
    resolution: Option<String>,
    fps: Option<f64>,
    filesize: Option<u64>,
    vcodec: Option<String>,
    acodec: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
}

fn app_config_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let path = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("Не удалось определить app config dir: {error}"))?;
    fs::create_dir_all(&path).map_err(|error| format!("Не удалось создать config dir: {error}"))?;
    Ok(path)
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Не удалось определить app data dir: {error}"))?;
    fs::create_dir_all(&path).map_err(|error| format!("Не удалось создать data dir: {error}"))?;
    Ok(path)
}

fn settings_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_config_dir(app)?.join(SETTINGS_FILE_NAME))
}

fn sanitize_optional_path(value: Option<String>) -> Result<Option<String>, String> {
    match value {
        None => Ok(None),
        Some(raw) => {
            let trimmed = raw.trim();
            if trimmed.is_empty() {
                return Ok(None);
            }
            if trimmed.len() > 512 {
                return Err("Путь слишком длинный.".to_string());
            }
            Ok(Some(trimmed.to_string()))
        }
    }
}

fn normalize_settings(mut settings: RuntimeToolsSettings) -> Result<RuntimeToolsSettings, String> {
    settings.ytdlp_mode = settings.ytdlp_mode.trim().to_lowercase();
    if settings.ytdlp_mode != "managed"
        && settings.ytdlp_mode != "custom"
        && settings.ytdlp_mode != "system"
    {
        settings.ytdlp_mode = "managed".to_string();
    }
    settings.ytdlp_custom_path = sanitize_optional_path(settings.ytdlp_custom_path)?;
    settings.ffmpeg_custom_path = sanitize_optional_path(settings.ffmpeg_custom_path)?;
    settings.ffprobe_custom_path = sanitize_optional_path(settings.ffprobe_custom_path)?;
    settings.projects_root_dir = sanitize_optional_path(settings.projects_root_dir)?;
    Ok(settings)
}

fn load_settings(app: &AppHandle) -> Result<RuntimeToolsSettings, String> {
    let path = settings_file_path(app)?;
    if !path.exists() {
        return Ok(RuntimeToolsSettings::default());
    }

    let raw = fs::read_to_string(&path)
        .map_err(|error| format!("Не удалось прочитать настройки: {error}"))?;
    let parsed: RuntimeToolsSettings = serde_json::from_str(&raw)
        .map_err(|error| format!("Не удалось распарсить настройки: {error}"))?;
    normalize_settings(parsed)
}

fn save_settings_internal(
    app: &AppHandle,
    settings: RuntimeToolsSettings,
) -> Result<RuntimeToolsSettings, String> {
    let normalized = normalize_settings(settings)?;
    let path = settings_file_path(app)?;
    let payload = serde_json::to_string_pretty(&normalized)
        .map_err(|error| format!("Не удалось сериализовать настройки: {error}"))?;
    fs::write(&path, payload)
        .map_err(|error| format!("Не удалось сохранить настройки: {error}"))?;
    Ok(normalized)
}

fn task_title(task: &str) -> String {
    if task.starts_with("youtube-download") {
        "Импорт YouTube".to_string()
    } else if task.starts_with("clip-export") {
        "Экспорт клипов".to_string()
    } else if task == "ffmpeg" {
        "Установка FFmpeg".to_string()
    } else if task == "ytdlp" {
        "Установка yt-dlp".to_string()
    } else {
        "Фоновая задача".to_string()
    }
}

fn emit_install_progress_with_detail(
    app: &AppHandle,
    task: &str,
    status: &str,
    message: &str,
    detail: Option<String>,
    progress: Option<f32>,
) {
    let payload = RuntimeInstallProgressEvent {
        task: task.to_string(),
        title: Some(task_title(task)),
        status: status.to_string(),
        message: message.to_string(),
        detail,
        progress,
    };
    let _ = app.emit(INSTALL_PROGRESS_EVENT, payload);
}

fn emit_install_progress(
    app: &AppHandle,
    task: &str,
    status: &str,
    message: &str,
    progress: Option<f32>,
) {
    emit_install_progress_with_detail(app, task, status, message, None, progress);
}

fn managed_ffmpeg_path(app: &AppHandle) -> Result<PathBuf, String> {
    let tools_dir = app_data_dir(app)?.join("tools");
    fs::create_dir_all(&tools_dir)
        .map_err(|error| format!("Не удалось создать tools dir: {error}"))?;
    Ok(tools_dir.join(platform_bin("ffmpeg")))
}

fn managed_ffprobe_path(app: &AppHandle) -> Result<PathBuf, String> {
    let tools_dir = app_data_dir(app)?.join("tools");
    fs::create_dir_all(&tools_dir)
        .map_err(|error| format!("Не удалось создать tools dir: {error}"))?;
    Ok(tools_dir.join(platform_bin("ffprobe")))
}

fn download_to_path_with_progress(
    app: &AppHandle,
    task: &str,
    source_url: &str,
    destination_path: &Path,
    start_progress: f32,
    end_progress: f32,
) -> Result<(), String> {
    let source_host = Url::parse(source_url)
        .ok()
        .and_then(|url| url.host_str().map(|host| host.to_string()))
        .unwrap_or_else(|| "неизвестный источник".to_string());
    emit_install_progress_with_detail(
        app,
        task,
        "progress",
        "Подключение к источнику...",
        Some(source_host.clone()),
        Some(start_progress),
    );

    let response = ureq::get(source_url)
        .call()
        .map_err(|error| format!("Не удалось скачать файл: {error}"))?;

    let total_size = response
        .header("content-length")
        .and_then(|value| value.parse::<u64>().ok());

    let mut reader = response.into_reader();
    let mut file = fs::File::create(destination_path)
        .map_err(|error| format!("Не удалось создать временный файл: {error}"))?;

    let mut downloaded = 0_u64;
    let mut last_emitted_percent = -1_i32;
    let mut last_emit_instant = Instant::now();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = reader
            .read(&mut buffer)
            .map_err(|error| format!("Ошибка чтения скачанного потока: {error}"))?;
        if read == 0 {
            break;
        }
        file.write_all(&buffer[..read])
            .map_err(|error| format!("Ошибка записи скачанного файла: {error}"))?;
        downloaded += read as u64;

        if let Some(total) = total_size {
            if total > 0 {
                let ratio = (downloaded as f64 / total as f64).clamp(0.0, 1.0);
                let progress = start_progress + (end_progress - start_progress) * ratio as f32;
                let percent = (ratio * 100.0).round() as i32;
                let should_emit = percent != last_emitted_percent
                    && (last_emit_instant.elapsed().as_millis() > 140 || percent >= 100);
                if should_emit {
                    last_emitted_percent = percent;
                    last_emit_instant = Instant::now();
                    let detail = format!(
                        "{:.1}/{:.1} MB • {}",
                        downloaded as f64 / (1024.0 * 1024.0),
                        total as f64 / (1024.0 * 1024.0),
                        source_host
                    );
                    emit_install_progress_with_detail(
                        app,
                        task,
                        "progress",
                        &format!("Загрузка артефактов: {percent}%"),
                        Some(detail),
                        Some(progress),
                    );
                }
            }
        } else if last_emit_instant.elapsed().as_millis() > 280 {
            last_emit_instant = Instant::now();
            emit_install_progress_with_detail(
                app,
                task,
                "progress",
                "Загрузка артефактов...",
                Some(format!(
                    "{:.1} MB получено • {}",
                    downloaded as f64 / (1024.0 * 1024.0),
                    source_host
                )),
                Some(start_progress),
            );
        }
    }

    if downloaded < 1024 * 256 {
        return Err("Скачанный файл слишком маленький и может быть поврежден.".to_string());
    }

    emit_install_progress_with_detail(
        app,
        task,
        "progress",
        "Файл успешно скачан.",
        Some(source_host),
        Some(end_progress),
    );
    Ok(())
}

fn run_version(binary: &Path, arg: &str) -> Option<String> {
    let output = Command::new(binary).arg(arg).output().ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    stdout
        .lines()
        .find(|line| !line.trim().is_empty())
        .map(|line| line.trim().to_string())
}

fn platform_bin(name: &str) -> String {
    if cfg!(target_os = "windows") {
        format!("{name}.exe")
    } else {
        name.to_string()
    }
}

fn resource_binary_candidates(app: &AppHandle, name: &str) -> Vec<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    let executable = platform_bin(name);

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join(&executable));
        candidates.push(resource_dir.join("bin").join(&executable));
    }

    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(parent) = exe_path.parent() {
            candidates.push(parent.join(&executable));
            candidates.push(parent.join("resources").join(&executable));
            candidates.push(parent.join("resources").join("bin").join(&executable));
        }
    }

    candidates
}

fn managed_ytdlp_path(app: &AppHandle) -> Result<PathBuf, String> {
    let tools_dir = app_data_dir(app)?.join("tools");
    fs::create_dir_all(&tools_dir)
        .map_err(|error| format!("Не удалось создать tools dir: {error}"))?;
    Ok(tools_dir.join(platform_bin("yt-dlp")))
}

fn resolve_projects_root_dir(
    app: &AppHandle,
    settings: &RuntimeToolsSettings,
) -> Result<PathBuf, String> {
    let target = if let Some(custom_path) = settings.projects_root_dir.as_ref() {
        PathBuf::from(custom_path)
    } else {
        app_data_dir(app)?.join("imports")
    };
    fs::create_dir_all(&target)
        .map_err(|error| format!("Не удалось создать папку проектов: {error}"))?;
    Ok(target)
}

fn open_in_file_manager(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = Command::new("explorer");
        command.arg(path);
        command
    };

    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("open");
        command.arg(path);
        command
    };

    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = {
        let mut command = Command::new("xdg-open");
        command.arg(path);
        command
    };

    command
        .spawn()
        .map_err(|error| format!("Не удалось открыть папку: {error}"))?;
    Ok(())
}

fn find_system_ytdlp_path() -> Option<PathBuf> {
    which("yt-dlp").ok()
}

fn ensure_custom_binary(path: &str) -> Option<PathBuf> {
    let parsed = PathBuf::from(path);
    if parsed.exists() {
        Some(parsed)
    } else {
        None
    }
}

fn resolve_ffmpeg_binary(
    app: &AppHandle,
    settings: &RuntimeToolsSettings,
) -> Option<(PathBuf, String)> {
    if let Some(custom) = settings
        .ffmpeg_custom_path
        .as_ref()
        .and_then(|value| ensure_custom_binary(value))
    {
        return Some((custom, "custom".to_string()));
    }

    if let Ok(managed) = managed_ffmpeg_path(app) {
        if managed.exists() {
            return Some((managed, "managed".to_string()));
        }
    }

    let bundled = resource_binary_candidates(app, "ffmpeg")
        .into_iter()
        .find(|candidate| candidate.exists());
    if settings.prefer_bundled_ffmpeg {
        if let Some(path) = bundled.clone() {
            return Some((path, "bundled".to_string()));
        }
    }

    if let Ok(system) = which("ffmpeg") {
        return Some((system, "system".to_string()));
    }

    bundled.map(|path| (path, "bundled".to_string()))
}

fn resolve_ffprobe_binary(
    app: &AppHandle,
    settings: &RuntimeToolsSettings,
) -> Option<(PathBuf, String)> {
    if let Some(custom) = settings
        .ffprobe_custom_path
        .as_ref()
        .and_then(|value| ensure_custom_binary(value))
    {
        return Some((custom, "custom".to_string()));
    }

    if let Ok(managed) = managed_ffprobe_path(app) {
        if managed.exists() {
            return Some((managed, "managed".to_string()));
        }
    }

    let bundled = resource_binary_candidates(app, "ffprobe")
        .into_iter()
        .find(|candidate| candidate.exists());
    if settings.prefer_bundled_ffmpeg {
        if let Some(path) = bundled.clone() {
            return Some((path, "bundled".to_string()));
        }
    }

    if let Ok(system) = which("ffprobe") {
        return Some((system, "system".to_string()));
    }

    bundled.map(|path| (path, "bundled".to_string()))
}

fn resolve_ytdlp_binary(
    app: &AppHandle,
    settings: &RuntimeToolsSettings,
) -> Option<(PathBuf, String)> {
    if settings.ytdlp_mode == "custom" {
        return settings
            .ytdlp_custom_path
            .as_ref()
            .and_then(|value| ensure_custom_binary(value))
            .map(|path| (path, "custom".to_string()));
    }

    if settings.ytdlp_mode == "managed" {
        if let Ok(path) = managed_ytdlp_path(app) {
            if path.exists() {
                return Some((path, "managed".to_string()));
            }
        }
    }

    if let Some(system) = find_system_ytdlp_path() {
        return Some((system, "system".to_string()));
    }

    if settings.ytdlp_mode == "managed" {
        if let Ok(path) = managed_ytdlp_path(app) {
            if path.exists() {
                return Some((path, "managed".to_string()));
            }
        }
    }

    None
}

fn inspect_tool(
    path_with_source: Option<(PathBuf, String)>,
    name: &str,
    version_arg: &str,
) -> ToolStatus {
    match path_with_source {
        Some((path, source)) => {
            let version = run_version(&path, version_arg);
            ToolStatus {
                name: name.to_string(),
                available: version.is_some(),
                source,
                path: Some(path.to_string_lossy().to_string()),
                version,
                message: None,
            }
        }
        None => ToolStatus {
            name: name.to_string(),
            available: false,
            source: "missing".to_string(),
            path: None,
            version: None,
            message: Some("Инструмент не найден.".to_string()),
        },
    }
}

fn build_runtime_status(app: &AppHandle, settings: RuntimeToolsSettings) -> RuntimeToolsStatus {
    let ytdlp_system_available = find_system_ytdlp_path().is_some();
    let projects_dir = resolve_projects_root_dir(app, &settings)
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_else(|_| "imports".to_string());
    let ffmpeg = inspect_tool(resolve_ffmpeg_binary(app, &settings), "ffmpeg", "-version");
    let ffprobe = inspect_tool(
        resolve_ffprobe_binary(app, &settings),
        "ffprobe",
        "-version",
    );
    let ytdlp = inspect_tool(resolve_ytdlp_binary(app, &settings), "yt-dlp", "--version");

    RuntimeToolsStatus {
        settings,
        ffmpeg,
        ffprobe,
        ytdlp,
        ytdlp_system_available,
        projects_dir,
    }
}

fn validate_youtube_url(raw: &str) -> Result<Url, String> {
    let parsed = Url::parse(raw.trim()).map_err(|_| "Некорректная ссылка.".to_string())?;
    if parsed.scheme() != "https" {
        return Err("Разрешены только https-ссылки.".to_string());
    }
    let host = parsed
        .host_str()
        .ok_or_else(|| "Не удалось определить домен ссылки.".to_string())?
        .to_lowercase();
    let is_youtube = host == "youtu.be"
        || host.ends_with(".youtu.be")
        || host == "youtube.com"
        || host.ends_with(".youtube.com");
    if !is_youtube {
        return Err("Поддерживаются ссылки YouTube (youtube.com / youtu.be).".to_string());
    }
    Ok(parsed)
}

fn validate_format_id(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.len() > 64 {
        return Err("Некорректный формат-код.".to_string());
    }
    let valid = trimmed
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '+' | '-' | '_' | '.' | '/'));
    if !valid {
        return Err("Формат-код содержит недопустимые символы.".to_string());
    }
    Ok(trimmed.to_string())
}

fn sanitize_project_name(value: Option<String>) -> String {
    let fallback = "clipforge-import".to_string();
    let Some(raw) = value else {
        return fallback;
    };
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return fallback;
    }
    let mut normalized = String::with_capacity(trimmed.len());
    for ch in trimmed.chars().take(72) {
        if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
            normalized.push(ch);
        } else if ch.is_whitespace() {
            normalized.push('-');
        }
    }
    while normalized.contains("--") {
        normalized = normalized.replace("--", "-");
    }
    let normalized = normalized.trim_matches('-').to_string();
    if normalized.is_empty() {
        fallback
    } else {
        normalized
    }
}

fn sanitize_file_stem(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return "video".to_string();
    }
    let mut normalized = String::with_capacity(trimmed.len());
    for ch in trimmed.chars().take(96) {
        if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
            normalized.push(ch);
        } else if ch.is_whitespace() {
            normalized.push('-');
        }
    }
    while normalized.contains("--") {
        normalized = normalized.replace("--", "-");
    }
    let normalized = normalized.trim_matches('-').to_string();
    if normalized.is_empty() {
        "video".to_string()
    } else {
        normalized
    }
}

fn stage_local_video_file_sync(
    app: AppHandle,
    source_path: String,
    project_name: Option<String>,
) -> Result<String, String> {
    let settings = load_settings(&app)?;
    let source = PathBuf::from(source_path.trim());
    if !source.exists() || !source.is_file() {
        return Err("Исходный локальный файл не найден.".to_string());
    }

    let imports_root = resolve_projects_root_dir(&app, &settings)?;
    let project_dir = imports_root.join(sanitize_project_name(project_name));
    fs::create_dir_all(&project_dir)
        .map_err(|error| format!("Не удалось создать папку проекта: {error}"))?;

    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_lowercase())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "mp4".to_string());
    let stem = source
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("video");
    let safe_stem = sanitize_file_stem(stem);

    let mut target = project_dir.join(format!("{safe_stem}.{extension}"));
    if target.exists() {
        let mut index = 2_u32;
        loop {
            let candidate = project_dir.join(format!("{safe_stem}-{index}.{extension}"));
            if !candidate.exists() {
                target = candidate;
                break;
            }
            index += 1;
        }
    }

    fs::copy(&source, &target)
        .map_err(|error| format!("Не удалось скопировать локальный файл: {error}"))?;

    let ffprobe_binary = resolve_ffprobe_binary(&app, &settings).map(|(path, _)| path);
    let ffmpeg_binary = resolve_ffmpeg_binary(&app, &settings).map(|(path, _)| path);
    let mut final_target = target.clone();

    let mut should_normalize = false;
    let mut include_audio = true;
    if let Some(ffprobe_path) = ffprobe_binary.as_ref() {
        let duration = probe_media_duration_seconds(ffprobe_path, &target);
        let duration_invalid = duration
            .map(|value| !value.is_finite() || value < 0.5)
            .unwrap_or(false);
        let video_codec = probe_primary_codec(ffprobe_path, &target, "v:0");
        let audio_codec = probe_primary_codec(ffprobe_path, &target, "a:0");
        include_audio = audio_codec.is_some();

        let extension = target
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| value.to_lowercase())
            .unwrap_or_default();
        let video_codec_supported = matches!(
            video_codec.as_deref(),
            Some("h264") | Some("mpeg4") | Some("hevc") | Some("vp9")
        );
        let audio_codec_supported = if include_audio {
            matches!(
                audio_codec.as_deref(),
                Some("aac") | Some("mp3") | Some("opus")
            )
        } else {
            true
        };

        should_normalize = duration_invalid
            || extension != "mp4"
            || !video_codec_supported
            || !audio_codec_supported;
    }

    if should_normalize {
        let ffprobe_path = ffprobe_binary.as_ref().ok_or_else(|| {
            "Файл требует проверки совместимости, но ffprobe недоступен.".to_string()
        })?;
        let ffmpeg_path = ffmpeg_binary.as_ref().ok_or_else(|| {
            "Файл требует конвертации в совместимый MP4, но ffmpeg недоступен.".to_string()
        })?;

        let normalized_path = target.with_file_name(format!("{safe_stem}-compat.mp4"));
        if normalized_path.exists() {
            let _ = fs::remove_file(&normalized_path);
        }

        repair_container_with_ffmpeg(ffmpeg_path, &target, &normalized_path, true, include_audio)
            .map_err(|error| format!("Не удалось конвертировать локальный файл: {error}"))?;

        let normalized_duration = probe_media_duration_seconds(ffprobe_path, &normalized_path)
            .ok_or_else(|| "FFprobe не смог проверить конвертированный файл.".to_string())?;
        if !normalized_duration.is_finite() || normalized_duration < 0.5 {
            return Err(
                "Конвертация завершилась, но длительность файла остаётся некорректной.".to_string(),
            );
        }

        let _ = fs::remove_file(&target);
        final_target = normalized_path;
    }

    Ok(final_target.to_string_lossy().to_string())
}

fn parse_u64_field(value: Option<&str>) -> Option<u64> {
    value.and_then(|raw| raw.trim().parse::<u64>().ok())
}

fn parse_progress_ratio_from_parts(
    downloaded: Option<u64>,
    total: Option<u64>,
    total_estimate: Option<u64>,
) -> Option<f32> {
    let downloaded = downloaded?;
    let baseline = total.or(total_estimate)?;
    if baseline == 0 {
        return None;
    }
    Some((downloaded as f32 / baseline as f32).clamp(0.0, 1.0))
}

fn maybe_emit_ytdlp_progress(
    app: &AppHandle,
    task_key: &str,
    line: &str,
    last_ratio: &mut f32,
    last_emit: &mut Instant,
) {
    let Some(stripped) = line.strip_prefix("CF_PROGRESS|") else {
        return;
    };

    let parts: Vec<&str> = stripped.split('|').collect();
    let downloaded = parse_u64_field(parts.first().copied());
    let total = parse_u64_field(parts.get(1).copied());
    let total_estimate = parse_u64_field(parts.get(2).copied());
    let percent_hint = parts
        .get(3)
        .map(|raw| raw.trim().replace(['%', ' '], ""))
        .and_then(|raw| raw.parse::<f32>().ok())
        .map(|value| (value / 100.0).clamp(0.0, 1.0));

    let mut ratio = parse_progress_ratio_from_parts(downloaded, total, total_estimate)
        .or(percent_hint)
        .unwrap_or(0.0);
    if *last_ratio >= 0.0 {
        ratio = ratio.max(*last_ratio);
    }
    let should_emit = (ratio - *last_ratio).abs() >= 0.01
        && (last_emit.elapsed().as_millis() > 240 || ratio >= 0.995);
    if !should_emit {
        return;
    }

    *last_ratio = ratio;
    *last_emit = Instant::now();
    let used_total = total.or(total_estimate);
    let detail = if let (Some(done), Some(total_bytes)) = (downloaded, used_total) {
        format!(
            "{:.1}/{:.1} MB",
            done as f64 / (1024.0 * 1024.0),
            total_bytes as f64 / (1024.0 * 1024.0)
        )
    } else if let Some(done) = downloaded {
        format!("{:.1} MB", done as f64 / (1024.0 * 1024.0))
    } else {
        "Получение данных...".to_string()
    };

    emit_install_progress_with_detail(
        app,
        task_key,
        "progress",
        &format!("Скачивание видео: {}%", (ratio * 100.0).round() as i32),
        Some(detail),
        Some(ratio * 0.9),
    );
}

fn normalize_output_path_from_ytdlp(line: &str) -> Option<String> {
    let trimmed = line.trim().trim_matches('"');
    if trimmed.is_empty() {
        return None;
    }
    let normalized = trimmed.strip_prefix("\\\\?\\").unwrap_or(trimmed);
    Some(normalized.to_string())
}

fn find_latest_video_file(path: &Path) -> Option<PathBuf> {
    let entries = fs::read_dir(path).ok()?;
    let mut latest: Option<(PathBuf, std::time::SystemTime)> = None;
    for entry in entries.flatten() {
        let candidate = entry.path();
        if !candidate.is_file() {
            continue;
        }
        let extension = candidate
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| value.to_lowercase())
            .unwrap_or_default();
        if !matches!(extension.as_str(), "mp4" | "mkv" | "mov" | "webm" | "m4v") {
            continue;
        }
        let modified = entry
            .metadata()
            .ok()
            .and_then(|metadata| metadata.modified().ok())
            .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
        let should_replace = latest
            .as_ref()
            .map(|(_, current)| modified > *current)
            .unwrap_or(true);
        if should_replace {
            latest = Some((candidate, modified));
        }
    }
    latest.map(|(path, _)| path)
}

fn probe_media_duration_seconds(ffprobe_binary: &Path, media_path: &Path) -> Option<f64> {
    let output = Command::new(ffprobe_binary)
        .arg("-v")
        .arg("error")
        .arg("-show_entries")
        .arg("format=duration")
        .arg("-of")
        .arg("default=noprint_wrappers=1:nokey=1")
        .arg(media_path)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let raw = String::from_utf8_lossy(&output.stdout);
    raw.trim().parse::<f64>().ok()
}

fn repair_container_with_ffmpeg(
    ffmpeg_binary: &Path,
    source_path: &Path,
    output_path: &Path,
    reencode: bool,
    include_audio: bool,
) -> Result<(), String> {
    let mut command = Command::new(ffmpeg_binary);
    command.arg("-y").arg("-i").arg(source_path);
    command.arg("-map").arg("0:v:0");
    if include_audio {
        command.arg("-map").arg("0:a:0?");
    } else {
        command.arg("-an");
    }

    if reencode {
        command.arg("-c:v").arg("libx264");
        if include_audio {
            command
                .arg("-preset")
                .arg("veryfast")
                .arg("-crf")
                .arg("20")
                .arg("-c:a")
                .arg("aac")
                .arg("-b:a")
                .arg("160k");
        } else {
            command.arg("-preset").arg("veryfast").arg("-crf").arg("19");
        }
    } else {
        command.arg("-c").arg("copy");
    }

    command
        .arg("-movflags")
        .arg("+faststart")
        .arg(output_path)
        .stdout(Stdio::null())
        .stderr(Stdio::piped());

    let output = command
        .output()
        .map_err(|error| format!("Не удалось запустить FFmpeg для восстановления: {error}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let message = stderr
            .lines()
            .last()
            .unwrap_or("FFmpeg завершился с ошибкой.")
            .to_string();
        return Err(message);
    }
    Ok(())
}

fn probe_primary_codec(ffprobe_binary: &Path, media_path: &Path, selector: &str) -> Option<String> {
    let output = Command::new(ffprobe_binary)
        .arg("-v")
        .arg("error")
        .arg("-select_streams")
        .arg(selector)
        .arg("-show_entries")
        .arg("stream=codec_name")
        .arg("-of")
        .arg("default=noprint_wrappers=1:nokey=1")
        .arg(media_path)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let raw = String::from_utf8_lossy(&output.stdout);
    let codec = raw.lines().find(|line| !line.trim().is_empty())?.trim();
    if codec.is_empty() {
        None
    } else {
        Some(codec.to_string())
    }
}

fn sanitize_short_text(value: Option<String>, max_len: usize) -> Option<String> {
    value
        .map(|raw| raw.trim().chars().take(max_len).collect::<String>())
        .and_then(|trimmed| if trimmed.is_empty() { None } else { Some(trimmed) })
}

fn parse_aspect_ratio(value: &str) -> Option<f64> {
    let normalized = value.trim().replace(' ', "");
    if normalized.is_empty() {
        return None;
    }
    if let Some((left, right)) = normalized.split_once(':') {
        let width = left.parse::<f64>().ok()?;
        let height = right.parse::<f64>().ok()?;
        if width <= 0.0 || height <= 0.0 {
            return None;
        }
        return Some(width / height);
    }
    let ratio = normalized.parse::<f64>().ok()?;
    if ratio <= 0.0 {
        return None;
    }
    Some(ratio)
}

fn pick_render_resolution(aspect: &str) -> (u32, u32) {
    let ratio = parse_aspect_ratio(aspect).unwrap_or(16.0 / 9.0);
    if ratio <= 0.68 {
        return (1080, 1920);
    }
    if ratio >= 1.35 {
        return (1920, 1080);
    }
    (1080, 1080)
}

fn clamp_export_time(value: f64) -> f64 {
    if !value.is_finite() {
        return 0.0;
    }
    value.clamp(0.0, 60.0 * 60.0 * 10.0)
}

fn validate_export_path(raw: &str) -> Result<PathBuf, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("Путь к исходному видео не указан.".to_string());
    }
    if trimmed.len() > 2048 {
        return Err("Путь к видео слишком длинный.".to_string());
    }
    let normalized = trimmed.strip_prefix("\\\\?\\").unwrap_or(trimmed);
    let path = PathBuf::from(normalized);
    if !path.exists() || !path.is_file() {
        return Err("Исходный файл видео не найден.".to_string());
    }
    Ok(path)
}

fn compute_export_base_dir(
    app: &AppHandle,
    settings: &RuntimeToolsSettings,
    project_name: Option<String>,
    source_path: &Path,
) -> Result<PathBuf, String> {
    if let Some(parent) = source_path.parent() {
        if parent.exists() {
            return Ok(parent.join("exports"));
        }
    }
    let projects_root = resolve_projects_root_dir(app, settings)?;
    Ok(projects_root.join(sanitize_project_name(project_name)).join("exports"))
}

fn ensure_unique_export_file_path(base: &Path, stem: &str, ext: &str) -> PathBuf {
    let extension = if ext.trim().is_empty() { "mp4" } else { ext.trim() };
    let mut candidate = base.join(format!("{stem}.{extension}"));
    if !candidate.exists() {
        return candidate;
    }
    let mut index = 2_u32;
    loop {
        let next = base.join(format!("{stem}-{index}.{extension}"));
        if !next.exists() {
            candidate = next;
            break;
        }
        index += 1;
    }
    candidate
}

fn build_export_video_with_ffmpeg(
    ffmpeg_binary: &Path,
    source_path: &Path,
    output_path: &Path,
    start: f64,
    end: f64,
    aspect: &str,
) -> Result<(), String> {
    let safe_start = clamp_export_time(start);
    let safe_end = clamp_export_time(end);
    if safe_end <= safe_start + 0.1 {
        return Err("Диапазон экспорта слишком короткий.".to_string());
    }
    let duration = (safe_end - safe_start).max(0.1);
    let (target_w, target_h) = pick_render_resolution(aspect);
    let vf = format!(
        "scale={target_w}:{target_h}:force_original_aspect_ratio=decrease,pad={target_w}:{target_h}:(ow-iw)/2:(oh-ih)/2:black,setsar=1"
    );

    let output = Command::new(ffmpeg_binary)
        .arg("-y")
        .arg("-ss")
        .arg(format!("{safe_start:.3}"))
        .arg("-t")
        .arg(format!("{duration:.3}"))
        .arg("-i")
        .arg(source_path)
        .arg("-vf")
        .arg(vf)
        .arg("-map")
        .arg("0:v:0")
        .arg("-map")
        .arg("0:a:0?")
        .arg("-c:v")
        .arg("libx264")
        .arg("-preset")
        .arg("veryfast")
        .arg("-crf")
        .arg("20")
        .arg("-pix_fmt")
        .arg("yuv420p")
        .arg("-c:a")
        .arg("aac")
        .arg("-b:a")
        .arg("160k")
        .arg("-movflags")
        .arg("+faststart")
        .arg(output_path)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .map_err(|error| format!("Не удалось запустить FFmpeg для экспорта: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let message = stderr
            .lines()
            .last()
            .unwrap_or("FFmpeg завершился с ошибкой.")
            .to_string();
        return Err(message);
    }

    Ok(())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportMetadataItem {
    clip_id: String,
    platform_id: String,
    title: Option<String>,
    description: Option<String>,
    tags: Option<String>,
    start: f64,
    end: f64,
    output_path: String,
    cover_path: Option<String>,
}

fn export_clips_batch_sync(
    app: AppHandle,
    request: ClipBatchExportRequest,
) -> Result<ClipBatchExportResult, String> {
    if request.tasks.is_empty() {
        return Err("Нет задач для экспорта.".to_string());
    }
    if request.tasks.len() > 200 {
        return Err("Слишком много задач в одном экспорте.".to_string());
    }
    let settings = load_settings(&app)?;
    let ffmpeg_binary = resolve_ffmpeg_binary(&app, &settings)
        .map(|(path, _)| path)
        .ok_or_else(|| "FFmpeg не найден. Установите или настройте путь в разделе «Настройки».".to_string())?;
    let source_path = validate_export_path(&request.source_path)?;
    let base_export_dir = compute_export_base_dir(&app, &settings, request.project_name.clone(), &source_path)?;
    fs::create_dir_all(&base_export_dir)
        .map_err(|error| format!("Не удалось создать директорию экспорта: {error}"))?;
    let run_dir = base_export_dir.join(format!(
        "batch-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|_| "Не удалось вычислить время запуска экспорта.".to_string())?
            .as_secs()
    ));
    fs::create_dir_all(&run_dir)
        .map_err(|error| format!("Не удалось создать папку batch-экспорта: {error}"))?;

    let task_key = sanitize_optional_path(request.task_id)
        .ok()
        .flatten()
        .unwrap_or_else(|| format!("clip-export:{}", sanitize_project_name(Some(request.project_id.clone()))));
    emit_install_progress_with_detail(
        &app,
        &task_key,
        "progress",
        "Подготовка пакетного экспорта клипов...",
        Some(run_dir.to_string_lossy().to_string()),
        Some(0.02),
    );

    let mut artifacts: Vec<ClipExportArtifact> = Vec::with_capacity(request.tasks.len());
    let mut metadata_entries: Vec<ExportMetadataItem> = Vec::with_capacity(request.tasks.len());

    for (index, task) in request.tasks.iter().enumerate() {
        let safe_clip_id = sanitize_file_stem(&task.clip_id);
        let safe_platform_id = sanitize_file_stem(&task.platform_id);
        let safe_title = sanitize_short_text(task.title.clone(), 140);
        let safe_description = sanitize_short_text(task.description.clone(), 600);
        let safe_tags = sanitize_short_text(task.tags.clone(), 280);

        let clip_stem = if let Some(title) = safe_title.clone() {
            sanitize_file_stem(&title)
        } else {
            sanitize_file_stem(&format!("{safe_clip_id}-{safe_platform_id}"))
        };
        let output_path = ensure_unique_export_file_path(&run_dir, &clip_stem, "mp4");

        let start = clamp_export_time(task.start);
        let end = clamp_export_time(task.end);
        if end <= start + 0.1 {
            return Err(format!(
                "Некорректный диапазон клипа {} ({}-{}).",
                task.clip_id, task.start, task.end
            ));
        }

        let base_progress = index as f32 / request.tasks.len() as f32;
        emit_install_progress_with_detail(
            &app,
            &task_key,
            "progress",
            &format!(
                "Экспорт {} / {}: {}",
                index + 1,
                request.tasks.len(),
                safe_title
                    .clone()
                    .unwrap_or_else(|| format!("{} {}", task.clip_id, task.platform_id))
            ),
            Some(task.platform_id.clone()),
            Some(0.05 + base_progress * 0.88),
        );

        build_export_video_with_ffmpeg(
            &ffmpeg_binary,
            &source_path,
            &output_path,
            start,
            end,
            &task.aspect,
        )?;

        let mut exported_cover: Option<String> = None;
        if let Some(raw_cover_path) = task.cover_path.clone() {
            let trimmed = raw_cover_path.trim();
            if !trimmed.is_empty() {
                let cover_source = PathBuf::from(trimmed.strip_prefix("\\\\?\\").unwrap_or(trimmed));
                if cover_source.exists() && cover_source.is_file() {
                    let cover_ext = cover_source
                        .extension()
                        .and_then(|value| value.to_str())
                        .filter(|value| !value.trim().is_empty())
                        .unwrap_or("jpg");
                    let cover_target = ensure_unique_export_file_path(
                        &run_dir,
                        &format!("{clip_stem}-cover"),
                        cover_ext,
                    );
                    fs::copy(&cover_source, &cover_target).map_err(|error| {
                        format!("Не удалось скопировать обложку {}: {error}", cover_source.display())
                    })?;
                    exported_cover = Some(cover_target.to_string_lossy().to_string());
                }
            }
        }

        let artifact = ClipExportArtifact {
            clip_id: task.clip_id.clone(),
            platform_id: task.platform_id.clone(),
            output_path: output_path.to_string_lossy().to_string(),
            duration_seconds: (end - start),
            cover_path: exported_cover.clone(),
        };

        metadata_entries.push(ExportMetadataItem {
            clip_id: task.clip_id.clone(),
            platform_id: task.platform_id.clone(),
            title: safe_title,
            description: safe_description,
            tags: safe_tags,
            start,
            end,
            output_path: artifact.output_path.clone(),
            cover_path: exported_cover,
        });
        artifacts.push(artifact);
    }

    let metadata_path = run_dir.join("export-manifest.json");
    let metadata_payload = serde_json::to_string_pretty(&metadata_entries)
        .map_err(|error| format!("Не удалось сериализовать manifest экспорта: {error}"))?;
    fs::write(&metadata_path, metadata_payload)
        .map_err(|error| format!("Не удалось сохранить manifest экспорта: {error}"))?;

    emit_install_progress_with_detail(
        &app,
        &task_key,
        "success",
        "Пакетный экспорт завершён.",
        Some(run_dir.to_string_lossy().to_string()),
        Some(1.0),
    );

    Ok(ClipBatchExportResult {
        project_dir: run_dir.to_string_lossy().to_string(),
        exported_count: artifacts.len() as u32,
        artifacts,
    })
}

fn ytdlp_download_url() -> &'static str {
    if cfg!(target_os = "windows") {
        "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
    } else {
        "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp"
    }
}

fn install_managed_ytdlp_sync(app: AppHandle) -> Result<ToolStatus, String> {
    emit_install_progress(
        &app,
        "ytdlp",
        "progress",
        "Подготовка установки yt-dlp...",
        Some(0.03),
    );
    let target_path = managed_ytdlp_path(&app)?;
    let temp_path = target_path.with_extension("tmp");
    download_to_path_with_progress(&app, "ytdlp", ytdlp_download_url(), &temp_path, 0.08, 0.88)?;

    emit_install_progress(
        &app,
        "ytdlp",
        "progress",
        "Применение обновления yt-dlp...",
        Some(0.94),
    );

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = fs::Permissions::from_mode(0o755);
        fs::set_permissions(&temp_path, perms)
            .map_err(|error| format!("Не удалось выставить права yt-dlp: {error}"))?;
    }

    fs::rename(&temp_path, &target_path)
        .map_err(|error| format!("Не удалось завершить установку yt-dlp: {error}"))?;

    let status = inspect_tool(
        Some((target_path, "managed".to_string())),
        "yt-dlp",
        "--version",
    );
    emit_install_progress(
        &app,
        "ytdlp",
        "success",
        "yt-dlp успешно установлен.",
        Some(1.0),
    );
    Ok(status)
}

fn extract_ffmpeg_windows_binaries(
    archive_path: &Path,
    ffmpeg_out_path: &Path,
    ffprobe_out_path: &Path,
) -> Result<(), String> {
    let file = fs::File::open(archive_path)
        .map_err(|error| format!("Не удалось открыть архив ffmpeg: {error}"))?;
    let mut archive = ZipArchive::new(file)
        .map_err(|error| format!("Не удалось прочитать архив ffmpeg: {error}"))?;

    let mut ffmpeg_found = false;
    let mut ffprobe_found = false;

    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|error| format!("Ошибка чтения элемента архива ffmpeg: {error}"))?;
        if !entry.is_file() {
            continue;
        }

        let normalized_name = entry.name().replace('\\', "/").to_lowercase();
        if normalized_name.ends_with("/bin/ffmpeg.exe") {
            let mut output = fs::File::create(ffmpeg_out_path)
                .map_err(|error| format!("Не удалось создать ffmpeg.exe: {error}"))?;
            std::io::copy(&mut entry, &mut output)
                .map_err(|error| format!("Не удалось распаковать ffmpeg.exe: {error}"))?;
            ffmpeg_found = true;
            continue;
        }

        if normalized_name.ends_with("/bin/ffprobe.exe") {
            let mut output = fs::File::create(ffprobe_out_path)
                .map_err(|error| format!("Не удалось создать ffprobe.exe: {error}"))?;
            std::io::copy(&mut entry, &mut output)
                .map_err(|error| format!("Не удалось распаковать ffprobe.exe: {error}"))?;
            ffprobe_found = true;
        }
    }

    if !ffmpeg_found || !ffprobe_found {
        return Err("В архиве не найдены ffmpeg.exe и ffprobe.exe.".to_string());
    }

    Ok(())
}

fn install_managed_ffmpeg_sync(app: AppHandle) -> Result<RuntimeToolsStatus, String> {
    emit_install_progress(
        &app,
        "ffmpeg",
        "progress",
        "Подготовка установки FFmpeg...",
        Some(0.03),
    );

    if !cfg!(target_os = "windows") {
        emit_install_progress(
            &app,
            "ffmpeg",
            "error",
            "Managed-установка FFmpeg сейчас поддерживается только на Windows.",
            None,
        );
        return Err("Managed-установка FFmpeg пока поддерживается только на Windows.".to_string());
    }

    let ffmpeg_target = managed_ffmpeg_path(&app)?;
    let ffprobe_target = managed_ffprobe_path(&app)?;
    let package_path = app_data_dir(&app)?
        .join("tools")
        .join("ffmpeg-package.tmp.zip");
    let ffmpeg_temp = ffmpeg_target.with_extension("tmp");
    let ffprobe_temp = ffprobe_target.with_extension("tmp");

    let mut downloaded = false;
    let mut last_error: Option<String> = None;
    for candidate_url in [FFMPEG_WINDOWS_ESSENTIALS_URL, FFMPEG_WINDOWS_FALLBACK_URL] {
        match download_to_path_with_progress(
            &app,
            "ffmpeg",
            candidate_url,
            &package_path,
            0.08,
            0.78,
        ) {
            Ok(_) => {
                downloaded = true;
                break;
            }
            Err(error) => {
                last_error = Some(error);
                emit_install_progress_with_detail(
                    &app,
                    "ffmpeg",
                    "progress",
                    "Переход к резервному источнику загрузки...",
                    Some(candidate_url.to_string()),
                    Some(0.1),
                );
            }
        }
    }
    if !downloaded {
        return Err(last_error.unwrap_or_else(|| "Не удалось загрузить FFmpeg.".to_string()));
    }

    emit_install_progress(
        &app,
        "ffmpeg",
        "progress",
        "Распаковка FFmpeg...",
        Some(0.84),
    );
    extract_ffmpeg_windows_binaries(&package_path, &ffmpeg_temp, &ffprobe_temp)?;

    emit_install_progress(
        &app,
        "ffmpeg",
        "progress",
        "Применение бинарников FFmpeg...",
        Some(0.93),
    );

    fs::rename(&ffmpeg_temp, &ffmpeg_target)
        .map_err(|error| format!("Не удалось сохранить ffmpeg.exe: {error}"))?;
    fs::rename(&ffprobe_temp, &ffprobe_target)
        .map_err(|error| format!("Не удалось сохранить ffprobe.exe: {error}"))?;

    if package_path.exists() {
        let _ = fs::remove_file(&package_path);
    }

    let settings = load_settings(&app)?;
    let status = build_runtime_status(&app, settings);
    emit_install_progress(
        &app,
        "ffmpeg",
        "success",
        "FFmpeg и FFprobe успешно установлены.",
        Some(1.0),
    );
    Ok(status)
}

fn probe_youtube_sync(app: AppHandle, raw_url: String) -> Result<YoutubeProbeResult, String> {
    let settings = load_settings(&app)?;
    let ytdlp_path = resolve_ytdlp_binary(&app, &settings)
        .map(|(path, _)| path)
        .ok_or_else(|| "yt-dlp не найден. Установите его в настройках.".to_string())?;
    let normalized_url = validate_youtube_url(&raw_url)?.to_string();

    let output = Command::new(&ytdlp_path)
        .arg("-J")
        .arg("--skip-download")
        .arg("--no-playlist")
        .arg("--no-warnings")
        .arg(&normalized_url)
        .output()
        .map_err(|error| format!("Не удалось выполнить yt-dlp: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let message = stderr
            .lines()
            .last()
            .unwrap_or("yt-dlp завершился с ошибкой.");
        return Err(message.to_string());
    }

    let payload: YtdlpProbePayload = serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("Не удалось распарсить ответ yt-dlp: {error}"))?;
    let formats = payload
        .formats
        .unwrap_or_default()
        .into_iter()
        .filter_map(|item| {
            let id = item.format_id?.trim().to_string();
            if id.is_empty() {
                return None;
            }
            let resolution = item
                .resolution
                .unwrap_or_else(|| match (item.width, item.height) {
                    (Some(width), Some(height)) => format!("{width}x{height}"),
                    _ => "auto".to_string(),
                });
            let ext = item.ext.unwrap_or_else(|| "unknown".to_string());
            let vcodec = item.vcodec.unwrap_or_else(|| "none".to_string());
            let acodec = item.acodec.unwrap_or_else(|| "none".to_string());
            let audio_only = vcodec == "none" && acodec != "none";
            let video_only = acodec == "none" && vcodec != "none";
            let note = item.format_note.unwrap_or_default();
            let label = if note.trim().is_empty() {
                format!("{resolution} • {ext} • {id}")
            } else {
                format!("{resolution} • {ext} • {note} • {id}")
            };
            Some(YoutubeFormatOption {
                id,
                label,
                ext,
                resolution,
                fps: item.fps,
                filesize: item.filesize,
                vcodec,
                acodec,
                audio_only,
                video_only,
            })
        })
        .collect::<Vec<_>>();

    Ok(YoutubeProbeResult {
        title: payload.title.unwrap_or_else(|| "YouTube видео".to_string()),
        uploader: payload.uploader,
        duration: payload.duration,
        thumbnail: payload.thumbnail,
        view_count: payload.view_count,
        like_count: payload.like_count,
        comment_count: payload.comment_count,
        upload_date: payload.upload_date,
        channel_id: payload.channel_id,
        channel_url: payload.channel_url,
        channel_followers: payload.channel_follower_count,
        formats,
    })
}

fn download_youtube_sync(
    app: AppHandle,
    request: YoutubeDownloadRequest,
) -> Result<YoutubeDownloadResult, String> {
    let settings = load_settings(&app)?;
    let ytdlp_path = resolve_ytdlp_binary(&app, &settings)
        .map(|(path, _)| path)
        .ok_or_else(|| "yt-dlp не найден. Установите его в настройках.".to_string())?;
    let normalized_url = validate_youtube_url(&request.url)?.to_string();
    let format_id = validate_format_id(&request.format_id)?;
    let selected_video_only = request.video_only.unwrap_or(false);
    let selected_audio_only = request.audio_only.unwrap_or(false);
    let include_audio = request.include_audio.unwrap_or(!selected_video_only);
    if selected_audio_only {
        return Err("Выбран аудио-формат без видеодорожки. Выберите видеоформат.".to_string());
    }
    let format_selector = if include_audio && selected_video_only {
        format!("{format_id}+bestaudio[ext=m4a]/{format_id}+bestaudio/{format_id}/best")
    } else if include_audio {
        format!("{format_id}/best[ext=mp4]/best")
    } else {
        format_id.to_string()
    };

    let imports_root = resolve_projects_root_dir(&app, &settings)?;
    let project_dir = imports_root.join(sanitize_project_name(request.project_name));
    fs::create_dir_all(&project_dir)
        .map_err(|error| format!("Не удалось создать папку проекта: {error}"))?;
    let output_template = project_dir.join("%(title).120B-%(id)s.%(ext)s");
    let task_key = sanitize_optional_path(request.task_id)
        .ok()
        .flatten()
        .unwrap_or_else(|| "youtube-download".to_string());

    let ffmpeg_location = resolve_ffmpeg_binary(&app, &settings)
        .map(|(path, _)| path)
        .and_then(|path| path.parent().map(|parent| parent.to_path_buf()));

    emit_install_progress_with_detail(
        &app,
        &task_key,
        "progress",
        "Подготовка импорта YouTube...",
        Some(normalized_url.clone()),
        Some(0.02),
    );

    let mut command = Command::new(&ytdlp_path);
    command
        .arg("--no-playlist")
        .arg("--newline")
        .arg("--progress")
        .arg("--no-warnings")
        .arg("--progress-template")
        .arg("download:CF_PROGRESS|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress._percent_str)s")
        .arg("--print")
        .arg("after_move:CF_OUTPUT|%(filepath)s")
        .arg("-f")
        .arg(&format_selector)
        .arg("-S")
        .arg(if include_audio {
            "res,fps,vcodec:h264,acodec:aac"
        } else {
            "res,fps,vcodec:h264"
        })
        .arg("--merge-output-format")
        .arg("mp4")
        .arg("-o")
        .arg(output_template.to_string_lossy().to_string())
        .arg(&normalized_url)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    if let Some(location) = ffmpeg_location {
        command.arg("--ffmpeg-location").arg(location);
    }

    let mut child = command
        .spawn()
        .map_err(|error| format!("Не удалось запустить загрузку через yt-dlp: {error}"))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Не удалось получить stdout для отслеживания прогресса.".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Не удалось получить stderr для отслеживания прогресса.".to_string())?;
    let reader = BufReader::new(stdout);
    let stderr_tail: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));

    let app_for_stderr = app.clone();
    let task_for_stderr = task_key.clone();
    let stderr_tail_for_thread = Arc::clone(&stderr_tail);
    let stderr_handle = thread::spawn(move || {
        let stderr_reader = BufReader::new(stderr);
        let mut last_line: Option<String> = None;
        let mut last_ratio = -1.0_f32;
        let mut last_emit = Instant::now();
        for line in stderr_reader.lines() {
            match line {
                Ok(current_line) => {
                    let trimmed = current_line.trim();
                    if !trimmed.is_empty() {
                        last_line = Some(trimmed.to_string());
                    }
                    maybe_emit_ytdlp_progress(
                        &app_for_stderr,
                        &task_for_stderr,
                        &current_line,
                        &mut last_ratio,
                        &mut last_emit,
                    );
                }
                Err(error) => {
                    if let Ok(mut guard) = stderr_tail_for_thread.lock() {
                        *guard = Some(format!("Ошибка чтения stderr yt-dlp: {error}"));
                    }
                    return;
                }
            }
        }
        if let Ok(mut guard) = stderr_tail_for_thread.lock() {
            if guard.is_none() {
                *guard = last_line;
            }
        }
    });

    let mut output_path: Option<String> = None;
    let mut last_stdout_line: Option<String> = None;
    let mut stdout_last_ratio = -1.0_f32;
    let mut stdout_last_emit = Instant::now();
    for line in reader.lines() {
        let current_line =
            line.map_err(|error| format!("Ошибка чтения прогресса yt-dlp: {error}"))?;
        let trimmed_line = current_line.trim();
        if !trimmed_line.is_empty() {
            last_stdout_line = Some(trimmed_line.to_string());
        }

        if let Some(stripped) = current_line.strip_prefix("CF_OUTPUT|") {
            if let Some(candidate) = normalize_output_path_from_ytdlp(stripped) {
                output_path = Some(candidate.clone());
                emit_install_progress_with_detail(
                    &app,
                    &task_key,
                    "progress",
                    "Файл сохранён в проекте. Финализация импорта...",
                    Some(candidate),
                    Some(0.96),
                );
            }
            continue;
        }

        // Некоторые сборки yt-dlp печатают прогресс в stdout, другие — в stderr.
        if current_line.starts_with("CF_PROGRESS|") {
            maybe_emit_ytdlp_progress(
                &app,
                &task_key,
                &current_line,
                &mut stdout_last_ratio,
                &mut stdout_last_emit,
            );
        }
    }

    let status = child
        .wait()
        .map_err(|error| format!("Не удалось дождаться завершения yt-dlp: {error}"))?;
    let _ = stderr_handle.join();
    let stderr_message = stderr_tail.lock().ok().and_then(|guard| guard.clone());
    if !status.success() {
        let message = stderr_message
            .or(last_stdout_line)
            .unwrap_or_else(|| "yt-dlp завершился с ошибкой.".to_string());
        emit_install_progress_with_detail(
            &app,
            &task_key,
            "error",
            "Ошибка импорта YouTube.",
            Some(message.clone()),
            None,
        );
        return Err(message);
    }

    let output_path = output_path
        .or_else(|| {
            find_latest_video_file(&project_dir).map(|value| value.to_string_lossy().to_string())
        })
        .ok_or_else(|| "Не удалось определить путь скачанного файла.".to_string())?;
    let mut final_output_path = PathBuf::from(&output_path);

    let ffprobe_binary = resolve_ffprobe_binary(&app, &settings).map(|(path, _)| path);
    let ffmpeg_binary = resolve_ffmpeg_binary(&app, &settings).map(|(path, _)| path);
    let current_duration = ffprobe_binary
        .as_ref()
        .and_then(|path| probe_media_duration_seconds(path, &final_output_path));
    let is_invalid_media = current_duration
        .map(|duration| !duration.is_finite() || duration < 0.5)
        .unwrap_or(false);

    if is_invalid_media {
        emit_install_progress_with_detail(
            &app,
            &task_key,
            "progress",
            "Проверка контейнера: обнаружен некорректный файл, запускаем восстановление...",
            Some(final_output_path.to_string_lossy().to_string()),
            Some(0.95),
        );

        let ffmpeg_path = ffmpeg_binary.ok_or_else(|| {
            "Файл загружен, но поврежден, и FFmpeg не найден для восстановления.".to_string()
        })?;
        let ffprobe_path = ffprobe_binary.ok_or_else(|| {
            "Файл загружен, но поврежден, и FFprobe не найден для валидации.".to_string()
        })?;

        let repaired_stem = final_output_path
            .file_stem()
            .and_then(|value| value.to_str())
            .map(|value| value.to_string())
            .unwrap_or_else(|| sanitize_project_name(Some(format_id.clone())));
        let repaired_copy_path =
            final_output_path.with_file_name(format!("{repaired_stem}-repaired.mp4"));
        if repaired_copy_path.exists() {
            let _ = fs::remove_file(&repaired_copy_path);
        }

        let copy_repair_result = repair_container_with_ffmpeg(
            &ffmpeg_path,
            &final_output_path,
            &repaired_copy_path,
            false,
            include_audio,
        );

        let copy_is_valid = copy_repair_result.is_ok()
            && probe_media_duration_seconds(&ffprobe_path, &repaired_copy_path)
                .map(|duration| duration.is_finite() && duration >= 0.5)
                .unwrap_or(false);

        if !copy_is_valid {
            if repaired_copy_path.exists() {
                let _ = fs::remove_file(&repaired_copy_path);
            }
            repair_container_with_ffmpeg(
                &ffmpeg_path,
                &final_output_path,
                &repaired_copy_path,
                true,
                include_audio,
            )
            .map_err(|error| {
                format!(
                    "Загрузка завершилась, но файл поврежден и не восстановился через FFmpeg: {error}"
                )
            })?;
        }

        let repaired_duration = probe_media_duration_seconds(&ffprobe_path, &repaired_copy_path)
            .ok_or_else(|| {
                "FFprobe не смог определить длительность восстановленного файла.".to_string()
            })?;
        if !repaired_duration.is_finite() || repaired_duration < 0.5 {
            return Err(
                "Восстановленный файл по-прежнему некорректен (длительность 0 секунд).".to_string(),
            );
        }

        let _ = fs::remove_file(&final_output_path);
        final_output_path = repaired_copy_path;
    }

    let ffprobe_binary = resolve_ffprobe_binary(&app, &settings).map(|(path, _)| path);
    let ffmpeg_binary = resolve_ffmpeg_binary(&app, &settings).map(|(path, _)| path);
    let mut normalized_duration = ffprobe_binary
        .as_ref()
        .and_then(|path| probe_media_duration_seconds(path, &final_output_path));

    if let Some(ffprobe_path) = ffprobe_binary.as_ref() {
        let video_codec = probe_primary_codec(ffprobe_path, &final_output_path, "v:0");
        let audio_codec = probe_primary_codec(ffprobe_path, &final_output_path, "a:0");
        let extension = final_output_path
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| value.to_lowercase())
            .unwrap_or_default();

        let video_codec_supported = matches!(
            video_codec.as_deref(),
            Some("h264") | Some("mpeg4") | Some("hevc") | Some("vp9")
        );
        let audio_codec_supported = if include_audio {
            matches!(
                audio_codec.as_deref(),
                Some("aac") | Some("mp3") | Some("opus")
            )
        } else {
            true
        };
        let has_audio_stream = audio_codec.is_some();
        let should_normalize = extension != "mp4"
            || !video_codec_supported
            || !audio_codec_supported
            || (include_audio && !has_audio_stream);

        if should_normalize {
            let ffmpeg_path = ffmpeg_binary.ok_or_else(|| {
                "Для приведения файла к совместимому формату не найден FFmpeg.".to_string()
            })?;
            emit_install_progress_with_detail(
                &app,
                &task_key,
                "progress",
                "Оптимизация совместимости файла (H.264/AAC)...",
                Some(final_output_path.to_string_lossy().to_string()),
                Some(0.98),
            );

            let normalized_stem = final_output_path
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or("clipforge-video")
                .to_string();
            let normalized_path =
                final_output_path.with_file_name(format!("{normalized_stem}-compat.mp4"));
            if normalized_path.exists() {
                let _ = fs::remove_file(&normalized_path);
            }

            repair_container_with_ffmpeg(
                &ffmpeg_path,
                &final_output_path,
                &normalized_path,
                true,
                include_audio,
            )
            .map_err(|error| format!("Не удалось подготовить совместимый MP4: {error}"))?;

            let normalized_duration_candidate =
                probe_media_duration_seconds(ffprobe_path, &normalized_path)
                    .ok_or_else(|| "FFprobe не смог проверить совместимый MP4.".to_string())?;
            if !normalized_duration_candidate.is_finite() || normalized_duration_candidate < 0.5 {
                return Err(
                    "Совместимый MP4 создан, но длительность всё ещё некорректна.".to_string(),
                );
            }
            let _ = fs::remove_file(&final_output_path);
            final_output_path = normalized_path;
            normalized_duration = Some(normalized_duration_candidate);
        }
    }

    let duration_seconds = normalized_duration
        .filter(|value| value.is_finite() && *value > 0.0)
        .map(|value| value.round() as u32);

    emit_install_progress_with_detail(
        &app,
        &task_key,
        "success",
        "Видео из YouTube успешно импортировано.",
        Some(final_output_path.to_string_lossy().to_string()),
        Some(1.0),
    );

    Ok(YoutubeDownloadResult {
        output_path: final_output_path.to_string_lossy().to_string(),
        source_url: normalized_url,
        format_id,
        duration_seconds,
    })
}

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
pub fn open_path_in_file_manager(path: String) -> Result<String, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Путь не указан.".to_string());
    }
    if trimmed.len() > 1024 {
        return Err("Путь слишком длинный.".to_string());
    }

    let candidate = PathBuf::from(trimmed);
    let target = if candidate.is_file() {
        candidate
            .parent()
            .map(Path::to_path_buf)
            .ok_or_else(|| "Не удалось определить папку файла.".to_string())?
    } else {
        candidate
    };

    if !target.exists() {
        return Err("Указанный путь не существует.".to_string());
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
    .map_err(|error| format!("Ошибка фоновой задачи импорта локального видео: {error}"))?
}

#[tauri::command]
pub async fn install_or_update_managed_ytdlp(app: AppHandle) -> Result<ToolStatus, String> {
    let app_for_task = app.clone();
    tauri::async_runtime::spawn_blocking(move || install_managed_ytdlp_sync(app_for_task))
        .await
        .map_err(|error| format!("Ошибка фоновой задачи yt-dlp: {error}"))?
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
        .map_err(|error| format!("Ошибка фоновой задачи ffmpeg: {error}"))?
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
        .map_err(|error| format!("Ошибка фоновой задачи probe: {error}"))?
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
        .map_err(|error| format!("Ошибка фоновой задачи download: {error}"))?
        .inspect_err(|error| {
            emit_install_progress_with_detail(
                &app,
                &task_key,
                "error",
                "Ошибка импорта YouTube.",
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
        .map_err(|error| format!("Ошибка фоновой задачи пакетного экспорта: {error}"))?
}
