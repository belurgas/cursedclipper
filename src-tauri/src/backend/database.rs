// SQLite schema/bootstrap and project state persistence routines.
use super::*;

pub(super) fn initialize_database(connection: &Connection) -> Result<(), String> {
    connection
        .execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                description TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                updated_at_unix INTEGER NOT NULL,
                created_at_unix INTEGER NOT NULL,
                clips INTEGER NOT NULL DEFAULT 0,
                duration_seconds INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'draft',
                source_type TEXT,
                source_label TEXT,
                source_url TEXT,
                source_status TEXT,
                source_uploader TEXT,
                source_duration_seconds INTEGER,
                source_thumbnail TEXT,
                source_view_count INTEGER,
                source_view_count_previous INTEGER,
                source_like_count INTEGER,
                source_like_count_previous INTEGER,
                source_comment_count INTEGER,
                source_comment_count_previous INTEGER,
                source_upload_date TEXT,
                source_channel_id TEXT,
                source_channel_url TEXT,
                source_channel_followers INTEGER,
                source_channel_followers_previous INTEGER,
                source_metrics_updated_at TEXT,
                imported_media_path TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_projects_updated
              ON projects(updated_at_unix DESC);

            CREATE TABLE IF NOT EXISTS workspace_states (
                project_id TEXT PRIMARY KEY NOT NULL,
                state_json TEXT NOT NULL,
                updated_at_unix INTEGER NOT NULL,
                FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS project_resume (
                project_id TEXT PRIMARY KEY NOT NULL,
                active_mode TEXT NOT NULL,
                current_time REAL NOT NULL DEFAULT 0,
                active_clip_id TEXT,
                updated_at_unix INTEGER NOT NULL,
                FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
            );
            "#,
        )
        .map_err(|error| format!("Failed to apply database schema: {error}"))?;
    ensure_project_optional_columns(connection)?;
    Ok(())
}

pub(super) fn open_database(app: &AppHandle) -> Result<Connection, String> {
    let db_path = database_path(app)?;
    let connection = Connection::open(&db_path)
        .map_err(|error| format!("Failed to open database {db_path:?}: {error}"))?;

    connection
        .execute_batch(
            r#"
            PRAGMA foreign_keys = ON;
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            "#,
        )
        .map_err(|error| format!("Failed to apply database PRAGMAs: {error}"))?;

    let bootstrap_state = DB_BOOTSTRAP_STATE.get_or_init(|| Mutex::new(false));
    let mut initialized = bootstrap_state
        .lock()
        .map_err(|_| "Failed to acquire DB bootstrap lock.".to_string())?;
    if !*initialized {
        initialize_database(&connection)?;
        *initialized = true;
    }

    Ok(connection)
}

pub(super) fn ensure_project_optional_columns(connection: &Connection) -> Result<(), String> {
    let alter_statements = [
        "ALTER TABLE projects ADD COLUMN source_uploader TEXT",
        "ALTER TABLE projects ADD COLUMN source_duration_seconds INTEGER",
        "ALTER TABLE projects ADD COLUMN source_thumbnail TEXT",
        "ALTER TABLE projects ADD COLUMN source_view_count INTEGER",
        "ALTER TABLE projects ADD COLUMN source_view_count_previous INTEGER",
        "ALTER TABLE projects ADD COLUMN source_like_count INTEGER",
        "ALTER TABLE projects ADD COLUMN source_like_count_previous INTEGER",
        "ALTER TABLE projects ADD COLUMN source_comment_count INTEGER",
        "ALTER TABLE projects ADD COLUMN source_comment_count_previous INTEGER",
        "ALTER TABLE projects ADD COLUMN source_upload_date TEXT",
        "ALTER TABLE projects ADD COLUMN source_channel_id TEXT",
        "ALTER TABLE projects ADD COLUMN source_channel_url TEXT",
        "ALTER TABLE projects ADD COLUMN source_channel_followers INTEGER",
        "ALTER TABLE projects ADD COLUMN source_channel_followers_previous INTEGER",
        "ALTER TABLE projects ADD COLUMN source_metrics_updated_at TEXT",
        "ALTER TABLE projects ADD COLUMN imported_media_path TEXT",
    ];

    for sql in alter_statements {
        if let Err(error) = connection.execute(sql, []) {
            let message = error.to_string().to_lowercase();
            if !message.contains("duplicate column name") {
                return Err(format!("Failed to migrate projects schema: {error}"));
            }
        }
    }

    Ok(())
}

pub(super) fn row_to_project(row: &rusqlite::Row<'_>) -> rusqlite::Result<Project> {
    let clips: i64 = row.get("clips")?;
    let duration_seconds: i64 = row.get("duration_seconds")?;
    Ok(Project {
        id: row.get("id")?,
        name: row.get("name")?,
        description: row.get("description")?,
        updated_at: row.get("updated_at")?,
        clips: clips.max(0) as u32,
        duration_seconds: duration_seconds.max(0) as u32,
        status: row.get("status")?,
        source_type: row.get("source_type")?,
        source_label: row.get("source_label")?,
        source_url: row.get("source_url")?,
        source_status: row.get("source_status")?,
        source_uploader: row.get("source_uploader")?,
        source_duration_seconds: row
            .get::<_, Option<i64>>("source_duration_seconds")?
            .map(|value| value.max(0) as u32),
        source_thumbnail: row.get("source_thumbnail")?,
        source_view_count: row
            .get::<_, Option<i64>>("source_view_count")?
            .map(|value| value.max(0) as u64),
        source_view_count_previous: row
            .get::<_, Option<i64>>("source_view_count_previous")?
            .map(|value| value.max(0) as u64),
        source_like_count: row
            .get::<_, Option<i64>>("source_like_count")?
            .map(|value| value.max(0) as u64),
        source_like_count_previous: row
            .get::<_, Option<i64>>("source_like_count_previous")?
            .map(|value| value.max(0) as u64),
        source_comment_count: row
            .get::<_, Option<i64>>("source_comment_count")?
            .map(|value| value.max(0) as u64),
        source_comment_count_previous: row
            .get::<_, Option<i64>>("source_comment_count_previous")?
            .map(|value| value.max(0) as u64),
        source_upload_date: row.get("source_upload_date")?,
        source_channel_id: row.get("source_channel_id")?,
        source_channel_url: row.get("source_channel_url")?,
        source_channel_followers: row
            .get::<_, Option<i64>>("source_channel_followers")?
            .map(|value| value.max(0) as u64),
        source_channel_followers_previous: row
            .get::<_, Option<i64>>("source_channel_followers_previous")?
            .map(|value| value.max(0) as u64),
        source_metrics_updated_at: row.get("source_metrics_updated_at")?,
        imported_media_path: row.get("imported_media_path")?,
    })
}

pub(super) fn load_projects(connection: &Connection) -> Result<Vec<Project>, String> {
    let mut statement = connection
        .prepare(
            r#"
            SELECT
              id, name, description, updated_at, clips, duration_seconds, status,
              source_type, source_label, source_url, source_status, source_uploader,
              source_duration_seconds, source_thumbnail, source_view_count, source_view_count_previous,
              source_like_count, source_like_count_previous, source_comment_count, source_comment_count_previous,
              source_upload_date, source_channel_id, source_channel_url, source_channel_followers,
              source_channel_followers_previous, source_metrics_updated_at, imported_media_path
            FROM projects
            ORDER BY updated_at_unix DESC, created_at_unix DESC
            "#,
        )
        .map_err(|error| format!("Failed to prepare projects query: {error}"))?;

    let rows = statement
        .query_map([], row_to_project)
        .map_err(|error| format!("Failed to load projects: {error}"))?;

    let mut projects: Vec<Project> = Vec::new();
    for row in rows {
        projects.push(row.map_err(|error| format!("Failed to read project row: {error}"))?);
    }
    Ok(projects)
}

pub(super) fn load_project_by_id(
    connection: &Connection,
    project_id: &str,
) -> Result<Option<Project>, String> {
    connection
        .query_row(
            r#"
            SELECT
              id, name, description, updated_at, clips, duration_seconds, status,
              source_type, source_label, source_url, source_status, source_uploader,
              source_duration_seconds, source_thumbnail, source_view_count, source_view_count_previous,
              source_like_count, source_like_count_previous, source_comment_count, source_comment_count_previous,
              source_upload_date, source_channel_id, source_channel_url, source_channel_followers,
              source_channel_followers_previous, source_metrics_updated_at, imported_media_path
            FROM projects
            WHERE id = ?1
            "#,
            [project_id],
            row_to_project,
        )
        .optional()
        .map_err(|error| format!("Failed to load project: {error}"))
}

pub(super) fn validate_source_type(value: Option<String>) -> Option<String> {
    sanitize_optional_text(value, 24).and_then(|raw| {
        let normalized = raw.to_lowercase();
        if normalized == "local" || normalized == "youtube" {
            Some(normalized)
        } else {
            None
        }
    })
}

pub(super) fn validate_source_status(value: Option<String>) -> Option<String> {
    sanitize_optional_text(value, 24).and_then(|raw| {
        let normalized = raw.to_lowercase();
        if normalized == "pending" || normalized == "ready" || normalized == "failed" {
            Some(normalized)
        } else {
            None
        }
    })
}

pub(super) fn normalize_source_type_patch(value: String) -> Result<Option<String>, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    let normalized = trimmed.to_lowercase();
    if normalized == "local" || normalized == "youtube" {
        Ok(Some(normalized))
    } else {
        Err("Invalid project source type.".to_string())
    }
}

pub(super) fn normalize_source_status_patch(value: String) -> Result<Option<String>, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    let normalized = trimmed.to_lowercase();
    if normalized == "pending" || normalized == "ready" || normalized == "failed" {
        Ok(Some(normalized))
    } else {
        Err("Invalid project source status.".to_string())
    }
}

pub(super) fn normalize_project_status_patch(value: String) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("Project status cannot be empty.".to_string());
    }
    let normalized = trimmed.to_lowercase();
    if normalized == "ready" || normalized == "processing" || normalized == "draft" {
        Ok(normalized)
    } else {
        Err("Invalid project status.".to_string())
    }
}
