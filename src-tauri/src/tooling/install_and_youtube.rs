// Managed installer and YouTube probe/download synchronization routines.
use super::*;

pub(super) fn ytdlp_download_url() -> &'static str {
    if cfg!(target_os = "windows") {
        "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
    } else {
        "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp"
    }
}

pub(super) fn ytdlp_asset_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "yt-dlp.exe"
    } else {
        "yt-dlp"
    }
}

pub(super) fn expected_ytdlp_sha256() -> Result<String, String> {
    let manifest = download_text(YTDLP_SHA256SUMS_URL)?;
    parse_sha256_for_asset(&manifest, ytdlp_asset_name())
        .ok_or_else(|| "Failed to find SHA256 for selected yt-dlp binary.".to_string())
}

pub(super) fn expected_ffmpeg_sha256_for_url(candidate_url: &str) -> Result<String, String> {
    if candidate_url == FFMPEG_WINDOWS_ESSENTIALS_URL {
        let payload = download_text(FFMPEG_WINDOWS_ESSENTIALS_SHA256_URL)?;
        return parse_sha256_token(&payload)
            .ok_or_else(|| "Failed to read SHA256 for ffmpeg-release-essentials.zip.".to_string());
    }
    if candidate_url == FFMPEG_WINDOWS_FALLBACK_URL {
        let manifest = download_text(FFMPEG_WINDOWS_FALLBACK_SHA256_URL)?;
        let file_name = Url::parse(candidate_url)
            .ok()
            .and_then(|url| {
                url.path_segments()
                    .and_then(|mut segments| segments.next_back().map(|name| name.to_string()))
            })
            .ok_or_else(|| "Failed to determine fallback FFmpeg archive filename.".to_string())?;
        return parse_sha256_for_asset(&manifest, &file_name)
            .ok_or_else(|| format!("Failed to find SHA256 for {file_name}."));
    }
    Err("Unknown FFmpeg archive source.".to_string())
}

pub(super) fn install_managed_ytdlp_sync(app: AppHandle) -> Result<ToolStatus, String> {
    emit_install_progress(
        &app,
        "ytdlp",
        "progress",
        "Preparing yt-dlp setup...",
        Some(0.03),
    );
    emit_install_progress(
        &app,
        "ytdlp",
        "progress",
        "Verifying yt-dlp release checksum...",
        Some(0.06),
    );
    let expected_sha256 = expected_ytdlp_sha256()?;

    let target_path = managed_ytdlp_path(&app)?;
    let temp_path = target_path.with_extension("tmp");
    download_to_path_with_progress(&app, "ytdlp", ytdlp_download_url(), &temp_path, 0.08, 0.88)?;
    emit_install_progress(
        &app,
        "ytdlp",
        "progress",
        "Validating downloaded yt-dlp integrity...",
        Some(0.91),
    );
    if let Err(error) = verify_download_checksum(&temp_path, &expected_sha256) {
        let _ = fs::remove_file(&temp_path);
        return Err(error);
    }

    emit_install_progress(
        &app,
        "ytdlp",
        "progress",
        "Applying yt-dlp update...",
        Some(0.94),
    );

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = fs::Permissions::from_mode(0o755);
        fs::set_permissions(&temp_path, perms)
            .map_err(|error| format!("Failed to set yt-dlp permissions: {error}"))?;
    }

    fs::rename(&temp_path, &target_path)
        .map_err(|error| format!("Failed to complete yt-dlp installation: {error}"))?;

    let status = inspect_tool(
        Some((target_path, "managed".to_string())),
        "yt-dlp",
        "--version",
    );
    emit_install_progress(
        &app,
        "ytdlp",
        "success",
        "yt-dlp installed successfully.",
        Some(1.0),
    );
    Ok(status)
}

pub(super) fn extract_ffmpeg_windows_binaries(
    archive_path: &Path,
    ffmpeg_out_path: &Path,
    ffprobe_out_path: &Path,
) -> Result<(), String> {
    let file = fs::File::open(archive_path)
        .map_err(|error| format!("Failed to open ffmpeg archive: {error}"))?;
    let mut archive =
        ZipArchive::new(file).map_err(|error| format!("Failed to read ffmpeg archive: {error}"))?;

    let mut ffmpeg_found = false;
    let mut ffprobe_found = false;

    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|error| format!("Failed to read ffmpeg archive entry: {error}"))?;
        if !entry.is_file() {
            continue;
        }

        let normalized_name = entry.name().replace('\\', "/").to_lowercase();
        if normalized_name.ends_with("/bin/ffmpeg.exe") {
            let mut output = fs::File::create(ffmpeg_out_path)
                .map_err(|error| format!("Failed to create ffmpeg.exe: {error}"))?;
            std::io::copy(&mut entry, &mut output)
                .map_err(|error| format!("Failed to extract ffmpeg.exe: {error}"))?;
            ffmpeg_found = true;
            continue;
        }

        if normalized_name.ends_with("/bin/ffprobe.exe") {
            let mut output = fs::File::create(ffprobe_out_path)
                .map_err(|error| format!("Failed to create ffprobe.exe: {error}"))?;
            std::io::copy(&mut entry, &mut output)
                .map_err(|error| format!("Failed to extract ffprobe.exe: {error}"))?;
            ffprobe_found = true;
        }
    }

    if !ffmpeg_found || !ffprobe_found {
        return Err("ffmpeg.exe and ffprobe.exe were not found in the archive.".to_string());
    }

    Ok(())
}

pub(super) fn install_managed_ffmpeg_sync(app: AppHandle) -> Result<RuntimeToolsStatus, String> {
    emit_install_progress(
        &app,
        "ffmpeg",
        "progress",
        "Preparing FFmpeg setup...",
        Some(0.03),
    );

    if !cfg!(target_os = "windows") {
        emit_install_progress(
            &app,
            "ffmpeg",
            "error",
            "Managed FFmpeg setup is currently supported only on Windows.",
            None,
        );
        return Err("Managed FFmpeg setup is supported only on Windows for now.".to_string());
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
        emit_install_progress_with_detail(
            &app,
            "ffmpeg",
            "progress",
            "Verifying FFmpeg archive checksum...",
            Some(candidate_url.to_string()),
            Some(0.06),
        );
        let expected_sha256 = match expected_ffmpeg_sha256_for_url(candidate_url) {
            Ok(value) => value,
            Err(error) => {
                last_error = Some(error);
                continue;
            }
        };
        match download_to_path_with_progress(
            &app,
            "ffmpeg",
            candidate_url,
            &package_path,
            0.08,
            0.78,
        ) {
            Ok(_) => match verify_download_checksum(&package_path, &expected_sha256) {
                Ok(_) => {
                    downloaded = true;
                    break;
                }
                Err(error) => {
                    last_error = Some(error);
                    let _ = fs::remove_file(&package_path);
                    emit_install_progress_with_detail(
                        &app,
                        "ffmpeg",
                        "progress",
                        "Checksum verification failed, trying fallback source...",
                        Some(candidate_url.to_string()),
                        Some(0.12),
                    );
                }
            },
            Err(error) => {
                last_error = Some(error);
                emit_install_progress_with_detail(
                    &app,
                    "ffmpeg",
                    "progress",
                    "Switching to fallback download source...",
                    Some(candidate_url.to_string()),
                    Some(0.1),
                );
            }
        }
    }
    if !downloaded {
        return Err(last_error.unwrap_or_else(|| "Failed to download FFmpeg.".to_string()));
    }

    emit_install_progress(
        &app,
        "ffmpeg",
        "progress",
        "Extracting FFmpeg...",
        Some(0.84),
    );
    extract_ffmpeg_windows_binaries(&package_path, &ffmpeg_temp, &ffprobe_temp)?;

    emit_install_progress(
        &app,
        "ffmpeg",
        "progress",
        "Applying FFmpeg binaries...",
        Some(0.93),
    );

    fs::rename(&ffmpeg_temp, &ffmpeg_target)
        .map_err(|error| format!("Failed to persist ffmpeg.exe: {error}"))?;
    fs::rename(&ffprobe_temp, &ffprobe_target)
        .map_err(|error| format!("Failed to persist ffprobe.exe: {error}"))?;

    if package_path.exists() {
        let _ = fs::remove_file(&package_path);
    }

    let settings = load_settings(&app)?;
    let status = build_runtime_status(&app, settings);
    emit_install_progress(
        &app,
        "ffmpeg",
        "success",
        "FFmpeg and FFprobe installed successfully.",
        Some(1.0),
    );
    Ok(status)
}

pub(super) fn probe_youtube_sync(
    app: AppHandle,
    raw_url: String,
) -> Result<YoutubeProbeResult, String> {
    let settings = load_settings(&app)?;
    let ytdlp_path = resolve_ytdlp_binary(&app, &settings)
        .map(|(path, _)| path)
        .ok_or_else(|| "yt-dlp was not found. Install it in Settings.".to_string())?;
    let normalized_url = validate_youtube_url(&raw_url)?.to_string();

    let output = hidden_command(&ytdlp_path)
        .arg("-J")
        .arg("--skip-download")
        .arg("--no-playlist")
        .arg("--no-warnings")
        .arg(&normalized_url)
        .output()
        .map_err(|error| format!("Failed to execute yt-dlp: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let message = stderr.lines().last().unwrap_or("yt-dlp failed.");
        return Err(message.to_string());
    }

    let payload: YtdlpProbePayload = serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("Failed to parse yt-dlp response: {error}"))?;
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
        title: payload.title.unwrap_or_else(|| "YouTube video".to_string()),
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

pub(super) fn download_youtube_sync(
    app: AppHandle,
    request: YoutubeDownloadRequest,
) -> Result<YoutubeDownloadResult, String> {
    let settings = load_settings(&app)?;
    let ytdlp_path = resolve_ytdlp_binary(&app, &settings)
        .map(|(path, _)| path)
        .ok_or_else(|| "yt-dlp was not found. Install it in Settings.".to_string())?;
    let normalized_url = validate_youtube_url(&request.url)?.to_string();
    let format_id = validate_format_id(&request.format_id)?;
    let selected_video_only = request.video_only.unwrap_or(false);
    let selected_audio_only = request.audio_only.unwrap_or(false);
    let include_audio = request.include_audio.unwrap_or(!selected_video_only);
    if selected_audio_only {
        return Err("An audio-only format was selected. Choose a video format.".to_string());
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
        .map_err(|error| format!("Failed to create project directory: {error}"))?;
    let initial_video_files: HashSet<PathBuf> =
        list_video_files(&project_dir).into_iter().collect();
    let download_started_at = SystemTime::now();
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
        "Preparing YouTube import...",
        Some(normalized_url.clone()),
        Some(0.02),
    );

    let mut command = hidden_command(&ytdlp_path);
    command
        .env("PYTHONIOENCODING", "UTF-8")
        .env("PYTHONUTF8", "1")
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
        .map_err(|error| format!("Failed to start yt-dlp download: {error}"))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to capture stdout for progress tracking.".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Failed to capture stderr for progress tracking.".to_string())?;
    let reader = BufReader::new(stdout);
    let stderr_tail: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));

    let app_for_stderr = app.clone();
    let task_for_stderr = task_key.clone();
    let stderr_tail_for_thread = Arc::clone(&stderr_tail);
    let stderr_handle = thread::spawn(move || {
        let mut stderr_reader = BufReader::new(stderr);
        let mut last_line: Option<String> = None;
        let mut last_ratio = -1.0_f32;
        let mut last_emit = Instant::now();
        let mut raw_buffer = Vec::<u8>::new();
        loop {
            match read_lossy_process_line(&mut stderr_reader, &mut raw_buffer) {
                Ok(Some(current_line)) => {
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
                Ok(None) => break,
                Err(error) => {
                    if let Ok(mut guard) = stderr_tail_for_thread.lock() {
                        *guard = Some(format!("Failed to read yt-dlp stderr: {error}"));
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

    let mut output_candidates: Vec<String> = Vec::new();
    let mut last_stdout_line: Option<String> = None;
    let mut stdout_last_ratio = -1.0_f32;
    let mut stdout_last_emit = Instant::now();
    let mut stdout_reader = reader;
    let mut raw_stdout_buffer = Vec::<u8>::new();
    loop {
        let current_line = match read_lossy_process_line(&mut stdout_reader, &mut raw_stdout_buffer)
        {
            Ok(Some(value)) => value,
            Ok(None) => break,
            Err(error) => {
                return Err(format!("Failed to read yt-dlp progress stream: {error}"));
            }
        };
        let trimmed_line = current_line.trim();
        if !trimmed_line.is_empty() {
            last_stdout_line = Some(trimmed_line.to_string());
        }

        if let Some(stripped) = current_line.strip_prefix("CF_OUTPUT|") {
            if let Some(candidate) = normalize_output_path_from_ytdlp(stripped) {
                if output_candidates.len() >= 32 {
                    output_candidates.remove(0);
                }
                output_candidates.push(candidate.clone());
                emit_install_progress_with_detail(
                    &app,
                    &task_key,
                    "progress",
                    "File saved to project. Finalizing import...",
                    Some(candidate),
                    Some(0.96),
                );
            }
            continue;
        }

        // Some yt-dlp builds print progress to stdout, others to stderr.
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
        .map_err(|error| format!("Failed while waiting for yt-dlp to finish: {error}"))?;
    let _ = stderr_handle.join();
    let stderr_message = stderr_tail.lock().ok().and_then(|guard| guard.clone());
    if !status.success() {
        let message = stderr_message
            .or(last_stdout_line)
            .unwrap_or_else(|| "yt-dlp failed.".to_string());
        emit_install_progress_with_detail(
            &app,
            &task_key,
            "error",
            "YouTube import failed.",
            Some(message.clone()),
            None,
        );
        return Err(message);
    }

    let project_dir_canonical =
        canonicalize_or_absolute_path_with_retry(&project_dir, 6, Duration::from_millis(70))?;
    let mut resolved_output_path: Option<PathBuf> = None;
    for candidate in output_candidates.iter().rev() {
        let mut candidate_path = PathBuf::from(candidate);
        if candidate_path.is_relative() {
            candidate_path = project_dir.join(candidate_path);
        }
        if !candidate_path.exists() || !candidate_path.is_file() {
            continue;
        }
        let Ok(canonical_candidate) =
            canonicalize_or_absolute_path_with_retry(&candidate_path, 8, Duration::from_millis(90))
        else {
            continue;
        };
        if canonical_candidate.starts_with(&project_dir_canonical) {
            resolved_output_path = Some(canonical_candidate);
            break;
        }
    }
    if resolved_output_path.is_none() {
        if let Some(latest_new_file) =
            find_latest_new_video_file(&project_dir, &initial_video_files)
        {
            if let Ok(canonical_latest) = canonicalize_or_absolute_path_with_retry(
                &latest_new_file,
                8,
                Duration::from_millis(90),
            ) {
                if canonical_latest.starts_with(&project_dir_canonical) {
                    resolved_output_path = Some(canonical_latest);
                }
            }
        }
    }
    if resolved_output_path.is_none() {
        if let Some(recent_file) =
            find_latest_video_file_modified_after(&project_dir, download_started_at)
        {
            if let Ok(canonical_latest) =
                canonicalize_or_absolute_path_with_retry(&recent_file, 8, Duration::from_millis(90))
            {
                if canonical_latest.starts_with(&project_dir_canonical) {
                    resolved_output_path = Some(canonical_latest);
                }
            }
        }
    }

    let mut final_output_path = resolved_output_path.ok_or_else(|| {
        let candidates_preview = if output_candidates.is_empty() {
            "none".to_string()
        } else {
            output_candidates
                .iter()
                .rev()
                .take(4)
                .cloned()
                .collect::<Vec<String>>()
                .join(" | ")
        };
        format!("Failed to resolve downloaded file path. yt-dlp candidates: {candidates_preview}")
    })?;
    if !final_output_path.starts_with(&project_dir_canonical) {
        return Err("Resolved output path is outside the project directory.".to_string());
    }

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
            "Container validation: invalid file detected, attempting recovery...",
            Some(final_output_path.to_string_lossy().to_string()),
            Some(0.95),
        );

        let ffmpeg_path = ffmpeg_binary.ok_or_else(|| {
            "File was downloaded but is corrupted, and FFmpeg is unavailable for recovery."
                .to_string()
        })?;
        let ffprobe_path = ffprobe_binary.ok_or_else(|| {
            "File was downloaded but is corrupted, and FFprobe is unavailable for validation."
                .to_string()
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
                    "Download completed, but file is corrupted and FFmpeg recovery failed: {error}"
                )
            })?;
        }

        let repaired_duration = probe_media_duration_seconds(&ffprobe_path, &repaired_copy_path)
            .ok_or_else(|| "FFprobe could not determine duration of recovered file.".to_string())?;
        if !repaired_duration.is_finite() || repaired_duration < 0.5 {
            return Err("Recovered file is still invalid (duration is 0 seconds).".to_string());
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
                "FFmpeg is unavailable for compatibility normalization.".to_string()
            })?;
            emit_install_progress_with_detail(
                &app,
                &task_key,
                "progress",
                "Optimizing file compatibility (H.264/AAC)...",
                Some(final_output_path.to_string_lossy().to_string()),
                Some(0.98),
            );

            let normalized_stem = final_output_path
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or("cursed-clipper-video")
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
            .map_err(|error| format!("Failed to prepare compatible MP4: {error}"))?;

            let normalized_duration_candidate =
                probe_media_duration_seconds(ffprobe_path, &normalized_path)
                    .ok_or_else(|| "FFprobe could not validate compatible MP4.".to_string())?;
            if !normalized_duration_candidate.is_finite() || normalized_duration_candidate < 0.5 {
                return Err(
                    "Compatible MP4 was created, but duration is still invalid.".to_string()
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
        "YouTube media imported successfully.",
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
