// Local media staging and yt-dlp/ffmpeg low-level media probing helpers.
use super::*;

pub(super) fn stage_local_video_file_sync(
    app: AppHandle,
    source_path: String,
    project_name: Option<String>,
) -> Result<String, String> {
    let settings = load_settings(&app)?;
    let source = PathBuf::from(source_path.trim());
    if !source.exists() || !source.is_file() {
        return Err("Source local file was not found.".to_string());
    }
    let source = canonicalize_existing_path(&source)?;

    let imports_root = resolve_projects_root_dir(&app, &settings)?;
    let project_dir = imports_root.join(sanitize_project_name(project_name));
    fs::create_dir_all(&project_dir)
        .map_err(|error| format!("Failed to create project folder: {error}"))?;

    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_lowercase())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "mp4".to_string());
    if !ALLOWED_VIDEO_EXTENSIONS.contains(&extension.as_str()) {
        return Err("Unsupported local video format.".to_string());
    }
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

    fs::copy(&source, &target).map_err(|error| format!("Failed to copy local file: {error}"))?;

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
            "File requires compatibility probing, but ffprobe is unavailable.".to_string()
        })?;
        let ffmpeg_path = ffmpeg_binary.as_ref().ok_or_else(|| {
            "File requires conversion to a compatible MP4, but ffmpeg is unavailable.".to_string()
        })?;

        let normalized_path = target.with_file_name(format!("{safe_stem}-compat.mp4"));
        if normalized_path.exists() {
            let _ = fs::remove_file(&normalized_path);
        }

        repair_container_with_ffmpeg(ffmpeg_path, &target, &normalized_path, true, include_audio)
            .map_err(|error| format!("Failed to convert local file: {error}"))?;

        let normalized_duration = probe_media_duration_seconds(ffprobe_path, &normalized_path)
            .ok_or_else(|| "FFprobe could not validate the converted file.".to_string())?;
        if !normalized_duration.is_finite() || normalized_duration < 0.5 {
            return Err("Conversion finished, but file duration is still invalid.".to_string());
        }

        let _ = fs::remove_file(&target);
        final_target = normalized_path;
    }

    Ok(final_target.to_string_lossy().to_string())
}

pub(super) fn parse_u64_field(value: Option<&str>) -> Option<u64> {
    value.and_then(|raw| raw.trim().parse::<u64>().ok())
}

pub(super) fn parse_progress_ratio_from_parts(
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

pub(super) fn maybe_emit_ytdlp_progress(
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
        "Fetching metadata...".to_string()
    };

    emit_install_progress_with_detail(
        app,
        task_key,
        "progress",
        &format!("Downloading video: {}%", (ratio * 100.0).round() as i32),
        Some(detail),
        Some(ratio * 0.9),
    );
}

pub(super) fn read_lossy_process_line<R: BufRead>(
    reader: &mut R,
    raw_buffer: &mut Vec<u8>,
) -> Result<Option<String>, std::io::Error> {
    raw_buffer.clear();
    let bytes_read = reader.read_until(b'\n', raw_buffer)?;
    if bytes_read == 0 {
        return Ok(None);
    }
    while matches!(raw_buffer.last(), Some(b'\n' | b'\r')) {
        raw_buffer.pop();
    }
    Ok(Some(String::from_utf8_lossy(raw_buffer).to_string()))
}

pub(super) fn normalize_output_path_from_ytdlp(line: &str) -> Option<String> {
    let trimmed = line.trim().trim_matches('"');
    if trimmed.is_empty() {
        return None;
    }
    let normalized = trimmed.strip_prefix("\\\\?\\").unwrap_or(trimmed);
    Some(normalized.to_string())
}

pub(super) fn is_allowed_video_file(path: &Path) -> bool {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_lowercase())
        .map(|value| ALLOWED_VIDEO_EXTENSIONS.contains(&value.as_str()))
        .unwrap_or(false)
}

pub(super) fn list_video_files(path: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    let Ok(entries) = fs::read_dir(path) else {
        return files;
    };
    for entry in entries.flatten() {
        let candidate = entry.path();
        if !candidate.is_file() || !is_allowed_video_file(&candidate) {
            continue;
        }
        files.push(candidate);
    }
    files
}

pub(super) fn file_modified_or_epoch(path: &Path) -> SystemTime {
    path.metadata()
        .ok()
        .and_then(|metadata| metadata.modified().ok())
        .unwrap_or(SystemTime::UNIX_EPOCH)
}

pub(super) fn find_latest_new_video_file(
    path: &Path,
    existing_files: &HashSet<PathBuf>,
) -> Option<PathBuf> {
    list_video_files(path)
        .into_iter()
        .filter(|candidate| !existing_files.contains(candidate))
        .max_by_key(|candidate| file_modified_or_epoch(candidate))
}

pub(super) fn find_latest_video_file_modified_after(
    path: &Path,
    threshold: SystemTime,
) -> Option<PathBuf> {
    let tolerance_floor = threshold
        .checked_sub(Duration::from_secs(5))
        .unwrap_or(SystemTime::UNIX_EPOCH);
    list_video_files(path)
        .into_iter()
        .filter(|candidate| file_modified_or_epoch(candidate) >= tolerance_floor)
        .max_by_key(|candidate| file_modified_or_epoch(candidate))
}

pub(super) fn probe_media_duration_seconds(
    ffprobe_binary: &Path,
    media_path: &Path,
) -> Option<f64> {
    let output = hidden_command(ffprobe_binary)
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

pub(super) fn repair_container_with_ffmpeg(
    ffmpeg_binary: &Path,
    source_path: &Path,
    output_path: &Path,
    reencode: bool,
    include_audio: bool,
) -> Result<(), String> {
    let mut command = hidden_command(ffmpeg_binary);
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
        .map_err(|error| format!("Failed to start FFmpeg for repair: {error}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let tail: Vec<&str> = stderr
            .lines()
            .map(|line| line.trim())
            .filter(|line| !line.is_empty())
            .rev()
            .take(4)
            .collect();
        let message = if tail.is_empty() {
            "FFmpeg exited with an error.".to_string()
        } else {
            let mut ordered = tail;
            ordered.reverse();
            format!("FFmpeg: {}", ordered.join(" | "))
        };
        return Err(message);
    }
    Ok(())
}

pub(super) fn probe_primary_codec(
    ffprobe_binary: &Path,
    media_path: &Path,
    selector: &str,
) -> Option<String> {
    let output = hidden_command(ffprobe_binary)
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
