// Public Tauri commands consumed by the frontend through invoke().
use super::*;

#[tauri::command]
pub fn get_dashboard_data(app: AppHandle) -> Result<DashboardDataPayload, String> {
    let connection = open_database(&app)?;
    let projects = load_projects(&connection)?;
    Ok(DashboardDataPayload {
        projects,
        news_feed: default_news_feed(),
        updates_feed: default_updates_feed(),
    })
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn create_project_draft(
    app: AppHandle,
    name: String,
    description: String,
    source_type: Option<String>,
    source_label: Option<String>,
    source_url: Option<String>,
    source_status: Option<String>,
    source_uploader: Option<String>,
    source_duration_seconds: Option<u32>,
    source_thumbnail: Option<String>,
    source_view_count: Option<u64>,
    source_view_count_previous: Option<u64>,
    source_like_count: Option<u64>,
    source_like_count_previous: Option<u64>,
    source_comment_count: Option<u64>,
    source_comment_count_previous: Option<u64>,
    source_upload_date: Option<String>,
    source_channel_id: Option<String>,
    source_channel_url: Option<String>,
    source_channel_followers: Option<u64>,
    source_channel_followers_previous: Option<u64>,
    source_metrics_updated_at: Option<String>,
    imported_media_path: Option<String>,
) -> Result<Project, String> {
    let safe_name = sanitize_text(name, 3, 90, "Project name")?;
    let safe_description = sanitize_text(description, 12, 220, "Project description")?;
    let safe_source_type = validate_source_type(source_type);
    let safe_source_status = validate_source_status(source_status);
    let safe_source_label = sanitize_optional_text(source_label, 140);
    let safe_source_url = sanitize_optional_text(source_url, 512);
    let safe_source_uploader = sanitize_optional_text(source_uploader, 180);
    let safe_source_duration_seconds = source_duration_seconds.map(|value| value.min(60 * 60 * 10));
    let safe_source_thumbnail = sanitize_optional_text(source_thumbnail, 512);
    let safe_source_view_count = source_view_count;
    let safe_source_view_count_previous = source_view_count_previous;
    let safe_source_like_count = source_like_count;
    let safe_source_like_count_previous = source_like_count_previous;
    let safe_source_comment_count = source_comment_count;
    let safe_source_comment_count_previous = source_comment_count_previous;
    let safe_source_upload_date = sanitize_optional_text(source_upload_date, 64);
    let safe_source_channel_id = sanitize_optional_text(source_channel_id, 128);
    let safe_source_channel_url = sanitize_optional_text(source_channel_url, 512);
    let safe_source_channel_followers = source_channel_followers;
    let safe_source_channel_followers_previous = source_channel_followers_previous;
    let safe_source_metrics_updated_at = sanitize_optional_text(source_metrics_updated_at, 64);
    let safe_imported_media_path = sanitize_optional_text(imported_media_path, 512);
    let now = now_unix_millis()?;
    let project = Project {
        id: format!("p_{now}"),
        name: safe_name,
        description: safe_description,
        updated_at: "just now".into(),
        clips: 0,
        duration_seconds: 0,
        status: "draft".into(),
        source_type: safe_source_type,
        source_label: safe_source_label,
        source_url: safe_source_url,
        source_status: safe_source_status,
        source_uploader: safe_source_uploader,
        source_duration_seconds: safe_source_duration_seconds,
        source_thumbnail: safe_source_thumbnail,
        source_view_count: safe_source_view_count,
        source_view_count_previous: safe_source_view_count_previous,
        source_like_count: safe_source_like_count,
        source_like_count_previous: safe_source_like_count_previous,
        source_comment_count: safe_source_comment_count,
        source_comment_count_previous: safe_source_comment_count_previous,
        source_upload_date: safe_source_upload_date,
        source_channel_id: safe_source_channel_id,
        source_channel_url: safe_source_channel_url,
        source_channel_followers: safe_source_channel_followers,
        source_channel_followers_previous: safe_source_channel_followers_previous,
        source_metrics_updated_at: safe_source_metrics_updated_at,
        imported_media_path: safe_imported_media_path,
    };

    let connection = open_database(&app)?;
    connection
        .execute(
            r#"
            INSERT INTO projects (
              id, name, description, updated_at, updated_at_unix, created_at_unix,
              clips, duration_seconds, status, source_type, source_label, source_url,
              source_status, source_uploader, source_duration_seconds, source_thumbnail,
              source_view_count, source_view_count_previous, source_like_count, source_like_count_previous,
              source_comment_count, source_comment_count_previous, source_upload_date,
              source_channel_id, source_channel_url, source_channel_followers,
              source_channel_followers_previous, source_metrics_updated_at, imported_media_path
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29)
            "#,
            params![
                project.id,
                project.name,
                project.description,
                project.updated_at,
                now,
                now,
                project.clips as i64,
                project.duration_seconds as i64,
                project.status,
                project.source_type,
                project.source_label,
                project.source_url,
                project.source_status,
                project.source_uploader,
                project.source_duration_seconds.map(|value| value as i64),
                project.source_thumbnail,
                project.source_view_count.map(|value| value as i64),
                project.source_view_count_previous.map(|value| value as i64),
                project.source_like_count.map(|value| value as i64),
                project.source_like_count_previous.map(|value| value as i64),
                project.source_comment_count.map(|value| value as i64),
                project.source_comment_count_previous.map(|value| value as i64),
                project.source_upload_date,
                project.source_channel_id,
                project.source_channel_url,
                project.source_channel_followers.map(|value| value as i64),
                project.source_channel_followers_previous.map(|value| value as i64),
                project.source_metrics_updated_at,
                project.imported_media_path,
            ],
        )
        .map_err(|error| format!("Failed to save project in database: {error}"))?;

    Ok(project)
}

#[tauri::command]
pub fn patch_project(
    app: AppHandle,
    project_id: String,
    patch: ProjectPatch,
) -> Result<Project, String> {
    let safe_project_id = sanitize_text(project_id, 3, 120, "Project ID")?;
    let connection = open_database(&app)?;
    let mut project = load_project_by_id(&connection, &safe_project_id)?
        .ok_or_else(|| "Project not found.".to_string())?;

    if let Some(name) = patch.name {
        project.name = sanitize_text(name, 3, 90, "Project name")?;
    }
    if let Some(description) = patch.description {
        project.description = sanitize_text(description, 12, 220, "Project description")?;
    }
    if let Some(status) = patch.status {
        project.status = normalize_project_status_patch(status)?;
    }
    if let Some(clips) = patch.clips {
        project.clips = clips;
    }
    if let Some(duration_seconds) = patch.duration_seconds {
        project.duration_seconds = duration_seconds;
    }
    if let Some(source_type) = patch.source_type {
        project.source_type = normalize_source_type_patch(source_type)?;
    }
    if let Some(source_label) = patch.source_label {
        project.source_label = sanitize_optional_text(Some(source_label), 140);
    }
    if let Some(source_url) = patch.source_url {
        project.source_url = sanitize_optional_text(Some(source_url), 512);
    }
    if let Some(source_status) = patch.source_status {
        project.source_status = normalize_source_status_patch(source_status)?;
    }
    if let Some(source_uploader) = patch.source_uploader {
        project.source_uploader = sanitize_optional_text(Some(source_uploader), 180);
    }
    if let Some(source_duration_seconds) = patch.source_duration_seconds {
        project.source_duration_seconds = Some(source_duration_seconds.min(60 * 60 * 10));
    }
    if let Some(source_thumbnail) = patch.source_thumbnail {
        project.source_thumbnail = sanitize_optional_text(Some(source_thumbnail), 512);
    }
    if let Some(source_view_count) = patch.source_view_count {
        project.source_view_count = Some(source_view_count);
    }
    if let Some(source_view_count_previous) = patch.source_view_count_previous {
        project.source_view_count_previous = Some(source_view_count_previous);
    }
    if let Some(source_like_count) = patch.source_like_count {
        project.source_like_count = Some(source_like_count);
    }
    if let Some(source_like_count_previous) = patch.source_like_count_previous {
        project.source_like_count_previous = Some(source_like_count_previous);
    }
    if let Some(source_comment_count) = patch.source_comment_count {
        project.source_comment_count = Some(source_comment_count);
    }
    if let Some(source_comment_count_previous) = patch.source_comment_count_previous {
        project.source_comment_count_previous = Some(source_comment_count_previous);
    }
    if let Some(source_upload_date) = patch.source_upload_date {
        project.source_upload_date = sanitize_optional_text(Some(source_upload_date), 64);
    }
    if let Some(source_channel_id) = patch.source_channel_id {
        project.source_channel_id = sanitize_optional_text(Some(source_channel_id), 128);
    }
    if let Some(source_channel_url) = patch.source_channel_url {
        project.source_channel_url = sanitize_optional_text(Some(source_channel_url), 512);
    }
    if let Some(source_channel_followers) = patch.source_channel_followers {
        project.source_channel_followers = Some(source_channel_followers);
    }
    if let Some(source_channel_followers_previous) = patch.source_channel_followers_previous {
        project.source_channel_followers_previous = Some(source_channel_followers_previous);
    }
    if let Some(source_metrics_updated_at) = patch.source_metrics_updated_at {
        project.source_metrics_updated_at =
            sanitize_optional_text(Some(source_metrics_updated_at), 64);
    }
    if let Some(imported_media_path) = patch.imported_media_path {
        project.imported_media_path = sanitize_optional_text(Some(imported_media_path), 512);
    }

    project.updated_at = sanitize_optional_text(patch.updated_at, 32).unwrap_or("just now".into());
    let now = now_unix_millis()?;

    connection
        .execute(
            r#"
            UPDATE projects
            SET
              name = ?2,
              description = ?3,
              updated_at = ?4,
              updated_at_unix = ?5,
              clips = ?6,
              duration_seconds = ?7,
              status = ?8,
              source_type = ?9,
              source_label = ?10,
              source_url = ?11,
              source_status = ?12,
              source_uploader = ?13,
              source_duration_seconds = ?14,
              source_thumbnail = ?15,
              source_view_count = ?16,
              source_view_count_previous = ?17,
              source_like_count = ?18,
              source_like_count_previous = ?19,
              source_comment_count = ?20,
              source_comment_count_previous = ?21,
              source_upload_date = ?22,
              source_channel_id = ?23,
              source_channel_url = ?24,
              source_channel_followers = ?25,
              source_channel_followers_previous = ?26,
              source_metrics_updated_at = ?27,
              imported_media_path = ?28
            WHERE id = ?1
            "#,
            params![
                project.id,
                project.name,
                project.description,
                project.updated_at,
                now,
                project.clips as i64,
                project.duration_seconds as i64,
                project.status,
                project.source_type,
                project.source_label,
                project.source_url,
                project.source_status,
                project.source_uploader,
                project.source_duration_seconds.map(|value| value as i64),
                project.source_thumbnail,
                project.source_view_count.map(|value| value as i64),
                project.source_view_count_previous.map(|value| value as i64),
                project.source_like_count.map(|value| value as i64),
                project.source_like_count_previous.map(|value| value as i64),
                project.source_comment_count.map(|value| value as i64),
                project
                    .source_comment_count_previous
                    .map(|value| value as i64),
                project.source_upload_date,
                project.source_channel_id,
                project.source_channel_url,
                project.source_channel_followers.map(|value| value as i64),
                project
                    .source_channel_followers_previous
                    .map(|value| value as i64),
                project.source_metrics_updated_at,
                project.imported_media_path,
            ],
        )
        .map_err(|error| format!("Failed to update project: {error}"))?;

    Ok(project)
}

#[tauri::command]
pub fn delete_project(app: AppHandle, project_id: String) -> Result<bool, String> {
    let safe_project_id = sanitize_text(project_id, 3, 120, "Project ID")?;
    let connection = open_database(&app)?;
    let removed = connection
        .execute("DELETE FROM projects WHERE id = ?1", [safe_project_id])
        .map_err(|error| format!("Failed to delete project: {error}"))?;
    Ok(removed > 0)
}

#[tauri::command]
pub fn save_project_workspace_state(
    app: AppHandle,
    project_id: String,
    state_json: String,
) -> Result<(), String> {
    let safe_project_id = sanitize_text(project_id, 3, 120, "Project ID")?;
    if state_json.len() > 32_000_000 {
        return Err("Project state payload is too large to save.".to_string());
    }

    let connection = open_database(&app)?;
    let now = now_unix_millis()?;
    connection
        .execute(
            r#"
            INSERT INTO workspace_states (project_id, state_json, updated_at_unix)
            VALUES (?1, ?2, ?3)
            ON CONFLICT(project_id) DO UPDATE
            SET state_json = excluded.state_json, updated_at_unix = excluded.updated_at_unix
            "#,
            params![safe_project_id, state_json, now],
        )
        .map_err(|error| format!("Failed to save project state: {error}"))?;
    Ok(())
}

#[tauri::command]
pub fn load_project_workspace_state(
    app: AppHandle,
    project_id: String,
) -> Result<Option<String>, String> {
    let safe_project_id = sanitize_text(project_id, 3, 120, "Project ID")?;
    let connection = open_database(&app)?;
    connection
        .query_row(
            "SELECT state_json FROM workspace_states WHERE project_id = ?1",
            [safe_project_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| format!("Failed to load project state: {error}"))
}

#[tauri::command]
pub fn save_project_resume_state(
    app: AppHandle,
    project_id: String,
    active_mode: String,
    current_time: f64,
    active_clip_id: Option<String>,
) -> Result<ProjectResumeState, String> {
    let safe_project_id = sanitize_text(project_id, 3, 120, "Project ID")?;
    let safe_active_mode = sanitize_text(active_mode, 3, 32, "Project mode")?;
    let safe_current_time = if current_time.is_finite() {
        current_time.clamp(0.0, 60.0 * 60.0 * 10.0)
    } else {
        0.0
    };
    let safe_active_clip_id = sanitize_optional_text(active_clip_id, 120);
    let now = now_unix_millis()?;
    let connection = open_database(&app)?;

    connection
        .execute(
            r#"
            INSERT INTO project_resume (project_id, active_mode, current_time, active_clip_id, updated_at_unix)
            VALUES (?1, ?2, ?3, ?4, ?5)
            ON CONFLICT(project_id) DO UPDATE
            SET active_mode = excluded.active_mode,
                current_time = excluded.current_time,
                active_clip_id = excluded.active_clip_id,
                updated_at_unix = excluded.updated_at_unix
            "#,
            params![
                safe_project_id,
                safe_active_mode,
                safe_current_time,
                safe_active_clip_id,
                now
            ],
        )
        .map_err(|error| format!("Failed to save resume point: {error}"))?;

    Ok(ProjectResumeState {
        active_mode: safe_active_mode,
        current_time: safe_current_time,
        active_clip_id: safe_active_clip_id,
        updated_at_unix: now,
    })
}

#[tauri::command]
pub fn load_project_resume_state(
    app: AppHandle,
    project_id: String,
) -> Result<Option<ProjectResumeState>, String> {
    let safe_project_id = sanitize_text(project_id, 3, 120, "Project ID")?;
    let connection = open_database(&app)?;

    connection
        .query_row(
            r#"
            SELECT active_mode, current_time, active_clip_id, updated_at_unix
            FROM project_resume
            WHERE project_id = ?1
            "#,
            [safe_project_id],
            |row| {
                Ok(ProjectResumeState {
                    active_mode: row.get("active_mode")?,
                    current_time: row.get("current_time")?,
                    active_clip_id: row.get("active_clip_id")?,
                    updated_at_unix: row.get("updated_at_unix")?,
                })
            },
        )
        .optional()
        .map_err(|error| format!("Failed to load resume point: {error}"))
}

#[tauri::command]
pub fn generate_workspace_mock(
    project_name: String,
    duration: f64,
) -> Result<WorkspaceMockPayload, String> {
    let safe_project_name = if project_name.trim().is_empty() {
        "New project".to_string()
    } else {
        project_name.trim().chars().take(120).collect()
    };
    let safe_duration = clamp_f64(duration, 30.0, 10_800.0);

    let words = make_mock_transcript(safe_duration);
    let semantic_blocks = build_semantic_blocks(safe_duration);
    let transcript_blocks = build_transcript_blocks(&words);
    let viral_score = compute_viral_score(&words);
    let viral_insights = build_viral_insights(viral_score);
    let hook_candidates = build_hook_candidates(&safe_project_name, &words);
    let content_plan_ideas = build_content_plan_ideas(&safe_project_name, &hook_candidates);
    let series_segments = build_series_segments(&semantic_blocks, safe_duration);
    let subtitle_presets = subtitle_presets();
    let platform_presets = platform_presets();
    let thumbnail_templates = build_thumbnail_templates(&safe_project_name, safe_duration);

    Ok(WorkspaceMockPayload {
        words,
        semantic_blocks,
        transcript_blocks,
        viral_score,
        viral_insights,
        hook_candidates,
        content_plan_ideas,
        series_segments,
        subtitle_presets: subtitle_presets.clone(),
        platform_presets: platform_presets.clone(),
        thumbnail_templates: thumbnail_templates.clone(),
        active_subtitle_preset_id: subtitle_presets
            .first()
            .map(|preset| preset.id.clone())
            .unwrap_or_default(),
        default_selected_platform_preset_ids: platform_presets
            .iter()
            .take(2)
            .map(|preset| preset.id.clone())
            .collect(),
    })
}

#[tauri::command]
pub fn regenerate_hooks(
    project_name: String,
    words: Vec<TranscriptWord>,
) -> Result<Vec<HookCandidate>, String> {
    if words.is_empty() {
        return Err("Not enough data to generate hooks".into());
    }
    let safe_project_name = if project_name.trim().is_empty() {
        "New project".to_string()
    } else {
        project_name.trim().chars().take(120).collect()
    };
    Ok(build_hook_candidates(&safe_project_name, &words))
}

#[tauri::command]
pub fn regenerate_thumbnails(
    project_name: String,
    duration: f64,
) -> Result<Vec<ThumbnailTemplate>, String> {
    let safe_project_name = if project_name.trim().is_empty() {
        "New project".to_string()
    } else {
        project_name.trim().chars().take(120).collect()
    };
    let safe_duration = clamp_f64(duration, 10.0, 10_800.0);
    Ok(build_thumbnail_templates(&safe_project_name, safe_duration))
}
