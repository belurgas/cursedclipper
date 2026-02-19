// Tooling runtime settings/status, trusted download helpers and common process primitives.
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::ffi::OsStr;
use std::fs;
use std::io::{Read, Write};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};
use url::Url;
use which::which;

pub(super) const SETTINGS_FILE_NAME: &str = "runtime-tools.json";
pub(super) const INSTALL_PROGRESS_EVENT: &str = "runtime-tools://install-progress";
pub(super) const FFMPEG_WINDOWS_ESSENTIALS_URL: &str =
    "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip";
pub(super) const FFMPEG_WINDOWS_FALLBACK_URL: &str =
    "https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip";
pub(super) const YTDLP_SHA256SUMS_URL: &str =
    "https://github.com/yt-dlp/yt-dlp/releases/latest/download/SHA2-256SUMS";
pub(super) const FFMPEG_WINDOWS_ESSENTIALS_SHA256_URL: &str =
    "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip.sha256";
pub(super) const FFMPEG_WINDOWS_FALLBACK_SHA256_URL: &str =
    "https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/checksums.sha256";
pub(super) const TRUSTED_DOWNLOAD_HOSTS: [&str; 4] = [
    "github.com",
    "objects.githubusercontent.com",
    "www.gyan.dev",
    "gyan.dev",
];
pub(super) const ALLOWED_VIDEO_EXTENSIONS: [&str; 9] = [
    "mp4", "mov", "mkv", "webm", "m4v", "avi", "wmv", "mpeg", "mpg",
];
#[cfg(target_os = "windows")]
pub(super) const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub(super) fn hidden_command(program: impl AsRef<OsStr>) -> Command {
    let mut command = Command::new(program);
    #[cfg(target_os = "windows")]
    {
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

pub(super) fn default_ui_language() -> String {
    "en".to_string()
}

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
    #[serde(default = "default_ui_language")]
    pub ui_language: String,
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
            ui_language: "en".to_string(),
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
    pub subtitles_enabled: Option<bool>,
    pub start: f64,
    pub end: f64,
    pub output_width: Option<u32>,
    pub output_height: Option<u32>,
    pub fit_mode: Option<String>,
    pub render_zoom: Option<f64>,
    pub render_offset_x: Option<f64>,
    pub render_offset_y: Option<f64>,
    pub subtitle_position_override: Option<String>,
    pub subtitle_offset_x: Option<f64>,
    pub subtitle_offset_y: Option<f64>,
    pub subtitle_box_width: Option<f64>,
    pub subtitle_box_height: Option<f64>,
    pub title: Option<String>,
    pub description: Option<String>,
    pub tags: Option<String>,
    pub cover_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportTranscriptWord {
    pub id: String,
    pub text: String,
    pub start: f64,
    pub end: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubtitleRenderProfile {
    pub animation: String,
    pub position: String,
    pub font_family: String,
    pub font_size: u32,
    pub line_height: f64,
    pub max_words_per_line: u32,
    pub max_chars_per_line: u32,
    pub max_lines: u32,
    pub safe_margin_x: u32,
    pub safe_margin_y: u32,
    pub primary_color: String,
    pub secondary_color: String,
    pub outline_color: String,
    pub shadow_color: String,
    pub outline_width: f64,
    pub shadow_depth: f64,
    pub bold: bool,
    pub italic: bool,
    pub all_caps: bool,
    pub letter_spacing: f64,
    pub fade_in_ms: u32,
    pub fade_out_ms: u32,
    pub highlight_important_words: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipBatchSubtitlePayload {
    pub enabled: bool,
    pub preset_id: String,
    pub preset_name: Option<String>,
    pub render_profile: SubtitleRenderProfile,
    pub words: Vec<ExportTranscriptWord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClipBatchExportRequest {
    pub project_id: String,
    pub project_name: Option<String>,
    pub source_path: String,
    pub task_id: Option<String>,
    pub tasks: Vec<ClipExportPlatformTask>,
    pub subtitles: Option<ClipBatchSubtitlePayload>,
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
pub(super) struct YtdlpProbePayload {
    pub(super) title: Option<String>,
    pub(super) uploader: Option<String>,
    pub(super) duration: Option<f64>,
    pub(super) thumbnail: Option<String>,
    pub(super) view_count: Option<u64>,
    pub(super) like_count: Option<u64>,
    pub(super) comment_count: Option<u64>,
    pub(super) upload_date: Option<String>,
    pub(super) channel_id: Option<String>,
    pub(super) channel_url: Option<String>,
    pub(super) channel_follower_count: Option<u64>,
    pub(super) formats: Option<Vec<YtdlpProbeFormat>>,
}

#[derive(Debug, Clone, Deserialize)]
pub(super) struct YtdlpProbeFormat {
    pub(super) format_id: Option<String>,
    pub(super) ext: Option<String>,
    pub(super) format_note: Option<String>,
    pub(super) resolution: Option<String>,
    pub(super) fps: Option<f64>,
    pub(super) filesize: Option<u64>,
    pub(super) vcodec: Option<String>,
    pub(super) acodec: Option<String>,
    pub(super) width: Option<u32>,
    pub(super) height: Option<u32>,
}

pub(super) fn app_config_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let path = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("Failed to resolve app config dir: {error}"))?;
    fs::create_dir_all(&path).map_err(|error| format!("Failed to create config dir: {error}"))?;
    Ok(path)
}

pub(super) fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data dir: {error}"))?;
    fs::create_dir_all(&path).map_err(|error| format!("Failed to create data dir: {error}"))?;
    Ok(path)
}

pub(super) fn settings_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_config_dir(app)?.join(SETTINGS_FILE_NAME))
}

pub(super) fn sanitize_optional_path(value: Option<String>) -> Result<Option<String>, String> {
    match value {
        None => Ok(None),
        Some(raw) => {
            let trimmed = raw.trim();
            if trimmed.is_empty() {
                return Ok(None);
            }
            if trimmed.len() > 512 {
                return Err("Path is too long.".to_string());
            }
            if trimmed.chars().any(|ch| ch.is_control()) {
                return Err("Path contains invalid control characters.".to_string());
            }
            Ok(Some(trimmed.to_string()))
        }
    }
}

pub(super) fn normalize_settings(
    mut settings: RuntimeToolsSettings,
) -> Result<RuntimeToolsSettings, String> {
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
    settings.ui_language = settings.ui_language.trim().to_lowercase();
    if settings.ui_language != "en" && settings.ui_language != "ru" {
        settings.ui_language = "en".to_string();
    }
    Ok(settings)
}

pub(super) fn load_settings(app: &AppHandle) -> Result<RuntimeToolsSettings, String> {
    let path = settings_file_path(app)?;
    if !path.exists() {
        return Ok(RuntimeToolsSettings::default());
    }

    let raw =
        fs::read_to_string(&path).map_err(|error| format!("Failed to read settings: {error}"))?;
    let parsed: RuntimeToolsSettings =
        serde_json::from_str(&raw).map_err(|error| format!("Failed to parse settings: {error}"))?;
    normalize_settings(parsed)
}

pub(super) fn save_settings_internal(
    app: &AppHandle,
    settings: RuntimeToolsSettings,
) -> Result<RuntimeToolsSettings, String> {
    let normalized = normalize_settings(settings)?;
    let path = settings_file_path(app)?;
    let payload = serde_json::to_string_pretty(&normalized)
        .map_err(|error| format!("Failed to serialize settings: {error}"))?;
    fs::write(&path, payload).map_err(|error| format!("Failed to save settings: {error}"))?;
    Ok(normalized)
}

pub(super) fn task_title(task: &str) -> String {
    if task.starts_with("youtube-download") {
        "YouTube import".to_string()
    } else if task.starts_with("clip-export") {
        "Clip export".to_string()
    } else if task == "ffmpeg" {
        "FFmpeg setup".to_string()
    } else if task == "ytdlp" {
        "yt-dlp setup".to_string()
    } else {
        "Background task".to_string()
    }
}

pub(super) fn emit_install_progress_with_detail(
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

pub(super) fn emit_install_progress(
    app: &AppHandle,
    task: &str,
    status: &str,
    message: &str,
    progress: Option<f32>,
) {
    emit_install_progress_with_detail(app, task, status, message, None, progress);
}

pub(super) fn trusted_host_match(host: &str, allowed_host: &str) -> bool {
    host.eq_ignore_ascii_case(allowed_host)
        || host
            .to_ascii_lowercase()
            .ends_with(&format!(".{}", allowed_host.to_ascii_lowercase()))
}

pub(super) fn ensure_trusted_https_url(url: &str) -> Result<Url, String> {
    let parsed = Url::parse(url).map_err(|_| "Invalid source URL.".to_string())?;
    if parsed.scheme() != "https" {
        return Err("Only HTTPS download sources are allowed.".to_string());
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("Source URL must not include credentials.".to_string());
    }
    if parsed.port().is_some() {
        return Err("Source URL must not include a custom port.".to_string());
    }
    let host = parsed
        .host_str()
        .ok_or_else(|| "Failed to resolve source domain.".to_string())?;
    if TRUSTED_DOWNLOAD_HOSTS
        .iter()
        .any(|allowed| trusted_host_match(host, allowed))
    {
        return Ok(parsed);
    }
    Err(format!("Untrusted download source: {host}"))
}

pub(super) fn download_text(url: &str) -> Result<String, String> {
    let parsed = ensure_trusted_https_url(url)?;
    let response = ureq::get(parsed.as_str())
        .call()
        .map_err(|error| format!("Failed to fetch checksum: {error}"))?;
    let mut reader = response.into_reader();
    let mut body = Vec::new();
    reader
        .read_to_end(&mut body)
        .map_err(|error| format!("Failed to read checksum: {error}"))?;
    String::from_utf8(body).map_err(|_| "Checksum response was not valid UTF-8.".to_string())
}

pub(super) fn parse_sha256_token(value: &str) -> Option<String> {
    value
        .split_whitespace()
        .find(|token| token.len() == 64 && token.chars().all(|ch| ch.is_ascii_hexdigit()))
        .map(|token| token.to_ascii_lowercase())
}

pub(super) fn parse_sha256_for_asset(manifest: &str, asset_name: &str) -> Option<String> {
    for line in manifest.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let normalized = trimmed.replace('*', " ");
        let mut parts = normalized.split_whitespace();
        let Some(hash) = parts.next() else {
            continue;
        };
        let Some(filename) = parts
            .next_back()
            .or_else(|| normalized.split_whitespace().nth(1))
        else {
            continue;
        };
        let candidate_name = filename.trim().trim_start_matches("./");
        if candidate_name.eq_ignore_ascii_case(asset_name)
            && hash.len() == 64
            && hash.chars().all(|ch| ch.is_ascii_hexdigit())
        {
            return Some(hash.to_ascii_lowercase());
        }
    }
    None
}

pub(super) fn sha256_of_file(path: &Path) -> Result<String, String> {
    let mut file = fs::File::open(path)
        .map_err(|error| format!("Failed to open file for checksum: {error}"))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| format!("Failed to read file for checksum: {error}"))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

pub(super) fn verify_download_checksum(path: &Path, expected_sha256: &str) -> Result<(), String> {
    let expected = expected_sha256.trim().to_ascii_lowercase();
    if expected.len() != 64 || !expected.chars().all(|ch| ch.is_ascii_hexdigit()) {
        return Err("Invalid expected SHA256 format.".to_string());
    }
    let actual = sha256_of_file(path)?;
    if actual != expected {
        return Err(format!(
            "Checksum mismatch. Expected {expected}, got {actual}."
        ));
    }
    Ok(())
}

pub(super) fn canonicalize_existing_path(path: &Path) -> Result<PathBuf, String> {
    fs::canonicalize(path).map_err(|error| format!("Failed to resolve path: {error}"))
}

pub(super) fn canonicalize_existing_path_with_retry(
    path: &Path,
    attempts: usize,
    delay: Duration,
) -> Result<PathBuf, String> {
    let mut last_error: Option<std::io::Error> = None;
    let total_attempts = attempts.max(1);
    for attempt in 0..total_attempts {
        match fs::canonicalize(path) {
            Ok(resolved) => return Ok(resolved),
            Err(error) => {
                last_error = Some(error);
                if attempt + 1 < total_attempts {
                    thread::sleep(delay);
                }
            }
        }
    }
    match last_error {
        Some(error) => Err(format!("Failed to resolve path: {error}")),
        None => Err("Failed to resolve path.".to_string()),
    }
}

pub(super) fn canonicalize_or_absolute_path_with_retry(
    path: &Path,
    attempts: usize,
    delay: Duration,
) -> Result<PathBuf, String> {
    match canonicalize_existing_path_with_retry(path, attempts, delay) {
        Ok(resolved) => Ok(resolved),
        Err(canonicalize_error) => {
            if !path.exists() {
                return Err(canonicalize_error);
            }
            if path.is_absolute() {
                return Ok(path.to_path_buf());
            }
            let cwd = std::env::current_dir()
                .map_err(|error| format!("Failed to resolve current directory: {error}"))?;
            Ok(cwd.join(path))
        }
    }
}

pub(super) fn managed_ffmpeg_path(app: &AppHandle) -> Result<PathBuf, String> {
    let tools_dir = app_data_dir(app)?.join("tools");
    fs::create_dir_all(&tools_dir)
        .map_err(|error| format!("Failed to create tools dir: {error}"))?;
    Ok(tools_dir.join(platform_bin("ffmpeg")))
}

pub(super) fn managed_ffprobe_path(app: &AppHandle) -> Result<PathBuf, String> {
    let tools_dir = app_data_dir(app)?.join("tools");
    fs::create_dir_all(&tools_dir)
        .map_err(|error| format!("Failed to create tools dir: {error}"))?;
    Ok(tools_dir.join(platform_bin("ffprobe")))
}

pub(super) fn download_to_path_with_progress(
    app: &AppHandle,
    task: &str,
    source_url: &str,
    destination_path: &Path,
    start_progress: f32,
    end_progress: f32,
) -> Result<(), String> {
    let parsed_url = ensure_trusted_https_url(source_url)?;
    let source_host = parsed_url
        .host_str()
        .map(|host| host.to_string())
        .unwrap_or_else(|| "unknown source".to_string());
    emit_install_progress_with_detail(
        app,
        task,
        "progress",
        "Connecting to source...",
        Some(source_host.clone()),
        Some(start_progress),
    );

    let response = ureq::get(parsed_url.as_str())
        .call()
        .map_err(|error| format!("Failed to download file: {error}"))?;

    let total_size = response
        .header("content-length")
        .and_then(|value| value.parse::<u64>().ok());

    let mut reader = response.into_reader();
    let mut file = fs::File::create(destination_path)
        .map_err(|error| format!("Failed to create temp file: {error}"))?;

    let mut downloaded = 0_u64;
    let mut last_emitted_percent = -1_i32;
    let mut last_emit_instant = Instant::now();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = reader
            .read(&mut buffer)
            .map_err(|error| format!("Failed to read downloaded stream: {error}"))?;
        if read == 0 {
            break;
        }
        file.write_all(&buffer[..read])
            .map_err(|error| format!("Failed to write downloaded file: {error}"))?;
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
                        &format!("Downloading artifacts: {percent}%"),
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
                "Downloading artifacts...",
                Some(format!(
                    "{:.1} MB received • {}",
                    downloaded as f64 / (1024.0 * 1024.0),
                    source_host
                )),
                Some(start_progress),
            );
        }
    }

    if downloaded < 1024 * 256 {
        return Err("Downloaded file is too small and may be corrupted.".to_string());
    }

    emit_install_progress_with_detail(
        app,
        task,
        "progress",
        "File downloaded successfully.",
        Some(source_host),
        Some(end_progress),
    );
    Ok(())
}

pub(super) fn run_version(binary: &Path, arg: &str) -> Option<String> {
    let output = hidden_command(binary).arg(arg).output().ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    stdout
        .lines()
        .find(|line| !line.trim().is_empty())
        .map(|line| line.trim().to_string())
}

pub(super) fn platform_bin(name: &str) -> String {
    if cfg!(target_os = "windows") {
        format!("{name}.exe")
    } else {
        name.to_string()
    }
}

pub(super) fn resource_binary_candidates(app: &AppHandle, name: &str) -> Vec<PathBuf> {
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

pub(super) fn managed_ytdlp_path(app: &AppHandle) -> Result<PathBuf, String> {
    let tools_dir = app_data_dir(app)?.join("tools");
    fs::create_dir_all(&tools_dir)
        .map_err(|error| format!("Failed to create tools dir: {error}"))?;
    Ok(tools_dir.join(platform_bin("yt-dlp")))
}

pub(super) fn resolve_projects_root_dir(
    app: &AppHandle,
    settings: &RuntimeToolsSettings,
) -> Result<PathBuf, String> {
    let target = if let Some(custom_path) = settings.projects_root_dir.as_ref() {
        PathBuf::from(custom_path)
    } else {
        app_data_dir(app)?.join("imports")
    };
    fs::create_dir_all(&target)
        .map_err(|error| format!("Failed to create projects folder: {error}"))?;
    let canonical = canonicalize_existing_path_with_retry(&target, 8, Duration::from_millis(80))?;
    if !canonical.is_dir() {
        return Err("Projects path must be a directory.".to_string());
    }
    Ok(canonical)
}

pub(super) fn open_in_file_manager(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = hidden_command("explorer");
        command.arg(path);
        command
    };

    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = hidden_command("open");
        command.arg(path);
        command
    };

    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = {
        let mut command = hidden_command("xdg-open");
        command.arg(path);
        command
    };

    command
        .spawn()
        .map_err(|error| format!("Failed to open folder: {error}"))?;
    Ok(())
}

pub(super) fn find_system_ytdlp_path() -> Option<PathBuf> {
    which("yt-dlp").ok()
}

pub(super) fn ensure_custom_binary(path: &str) -> Option<PathBuf> {
    let parsed = PathBuf::from(path);
    if !parsed.exists() {
        return None;
    }
    let canonical = canonicalize_existing_path(&parsed).ok()?;
    if canonical.is_file() {
        Some(canonical)
    } else {
        None
    }
}

pub(super) fn resolve_ffmpeg_binary(
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

pub(super) fn resolve_ffprobe_binary(
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

pub(super) fn resolve_ytdlp_binary(
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

pub(super) fn inspect_tool(
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
            message: Some("Tool not found.".to_string()),
        },
    }
}

pub(super) fn build_runtime_status(
    app: &AppHandle,
    settings: RuntimeToolsSettings,
) -> RuntimeToolsStatus {
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

pub(super) fn validate_youtube_url(raw: &str) -> Result<Url, String> {
    let parsed = Url::parse(raw.trim()).map_err(|_| "Invalid URL.".to_string())?;
    if parsed.scheme() != "https" {
        return Err("Only HTTPS links are allowed.".to_string());
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("YouTube link must not include credentials.".to_string());
    }
    if parsed.port().is_some() {
        return Err("YouTube link must not include a custom port.".to_string());
    }
    let host = parsed
        .host_str()
        .ok_or_else(|| "Failed to resolve link domain.".to_string())?
        .to_lowercase();
    let is_youtube = host == "youtu.be"
        || host.ends_with(".youtu.be")
        || host == "youtube.com"
        || host.ends_with(".youtube.com");
    if !is_youtube {
        return Err("Only YouTube links are supported (youtube.com / youtu.be).".to_string());
    }
    Ok(parsed)
}

pub(super) fn validate_format_id(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.len() > 64 {
        return Err("Invalid format code.".to_string());
    }
    let valid = trimmed
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '+' | '-' | '_' | '.' | '/'));
    if !valid {
        return Err("Format code contains invalid characters.".to_string());
    }
    Ok(trimmed.to_string())
}

pub(super) fn sanitize_project_name(value: Option<String>) -> String {
    let fallback = "cursed-clipper-import".to_string();
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

pub(super) fn sanitize_file_stem(value: &str) -> String {
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
