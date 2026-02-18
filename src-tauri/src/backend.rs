use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const SCRIPT: &str = "модель уже определила самые сильные хуки в этом интервью и ранжировала их по эмоциональной ясности и потенциалу удержания. теперь можно убрать паузы выровнять ритм и подготовить версии для reels shorts telegram и вертикальных публикаций. пока идет анализ зафиксируйте ключевые слова отметьте смысловые повороты и сохраните пики энергии спикера. каждое слово в этой панели привязано ко времени поэтому клипы можно собирать точно еще до финального рендера.";
const BLOCK_TYPE_CYCLE: [&str; 4] = ["hook", "story", "proof", "cta"];
const DATABASE_FILE_NAME: &str = "cursed-clipper-state.sqlite3";
// Keep legacy file name so existing installs continue using previous DB.
const LEGACY_DATABASE_FILE_NAME: &str = "clipforge-state.sqlite3";
const LEGACY_APP_IDENTIFIER: &str = "com.clipforge.studio";
static DB_BOOTSTRAP_STATE: OnceLock<Mutex<bool>> = OnceLock::new();

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub description: String,
    pub updated_at: String,
    pub clips: u32,
    pub duration_seconds: u32,
    pub status: String,
    pub source_type: Option<String>,
    pub source_label: Option<String>,
    pub source_url: Option<String>,
    pub source_status: Option<String>,
    pub source_uploader: Option<String>,
    pub source_duration_seconds: Option<u32>,
    pub source_thumbnail: Option<String>,
    pub source_view_count: Option<u64>,
    pub source_like_count: Option<u64>,
    pub source_comment_count: Option<u64>,
    pub source_upload_date: Option<String>,
    pub source_channel_id: Option<String>,
    pub source_channel_url: Option<String>,
    pub source_channel_followers: Option<u64>,
    pub imported_media_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewsItem {
    pub id: String,
    pub label: String,
    pub title: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranscriptWord {
    pub id: String,
    pub text: String,
    pub start: f64,
    pub end: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SemanticBlock {
    pub id: String,
    pub label: String,
    pub start: f64,
    pub end: f64,
    #[serde(rename = "type")]
    pub block_type: String,
    pub confidence: u8,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptSemanticBlock {
    pub id: String,
    pub label: String,
    pub start: f64,
    pub end: f64,
    #[serde(rename = "type")]
    pub block_type: String,
    pub confidence: u8,
    pub summary: String,
    pub word_start: usize,
    pub word_end: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ViralInsight {
    pub id: String,
    pub title: String,
    pub impact: String,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HookCandidate {
    pub id: String,
    pub headline: String,
    pub reasoning: String,
    pub predicted_lift: String,
    pub tone: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubtitlePreset {
    pub id: String,
    pub name: String,
    pub description: String,
    pub style_sample: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformPreset {
    pub id: String,
    pub name: String,
    pub aspect: String,
    pub max_duration: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentPlanIdea {
    pub id: String,
    pub title: String,
    pub angle: String,
    pub channels: Vec<String>,
    pub script_outline: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SeriesSegment {
    pub id: String,
    pub title: String,
    pub start: f64,
    pub end: f64,
    pub theme: String,
    pub rationale: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThumbnailTemplate {
    pub id: String,
    pub name: String,
    pub overlay_title: String,
    pub overlay_subtitle: String,
    pub focus_time: f64,
    pub palette: [String; 2],
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardDataPayload {
    pub projects: Vec<Project>,
    pub news_feed: Vec<NewsItem>,
    pub updates_feed: Vec<NewsItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceMockPayload {
    pub words: Vec<TranscriptWord>,
    pub semantic_blocks: Vec<SemanticBlock>,
    pub transcript_blocks: Vec<TranscriptSemanticBlock>,
    pub viral_score: u8,
    pub viral_insights: Vec<ViralInsight>,
    pub hook_candidates: Vec<HookCandidate>,
    pub content_plan_ideas: Vec<ContentPlanIdea>,
    pub series_segments: Vec<SeriesSegment>,
    pub subtitle_presets: Vec<SubtitlePreset>,
    pub platform_presets: Vec<PlatformPreset>,
    pub thumbnail_templates: Vec<ThumbnailTemplate>,
    pub active_subtitle_preset_id: String,
    pub default_selected_platform_preset_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProjectPatch {
    pub name: Option<String>,
    pub description: Option<String>,
    pub status: Option<String>,
    pub clips: Option<u32>,
    pub duration_seconds: Option<u32>,
    pub source_type: Option<String>,
    pub source_label: Option<String>,
    pub source_url: Option<String>,
    pub source_status: Option<String>,
    pub source_uploader: Option<String>,
    pub source_duration_seconds: Option<u32>,
    pub source_thumbnail: Option<String>,
    pub source_view_count: Option<u64>,
    pub source_like_count: Option<u64>,
    pub source_comment_count: Option<u64>,
    pub source_upload_date: Option<String>,
    pub source_channel_id: Option<String>,
    pub source_channel_url: Option<String>,
    pub source_channel_followers: Option<u64>,
    pub imported_media_path: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectResumeState {
    pub active_mode: String,
    pub current_time: f64,
    pub active_clip_id: Option<String>,
    pub updated_at_unix: i64,
}

fn clamp_f64(value: f64, min: f64, max: f64) -> f64 {
    value.min(max).max(min)
}

fn clamp_u8(value: i32, min: i32, max: i32) -> u8 {
    value.clamp(min, max) as u8
}

fn sanitize_text(
    value: String,
    min_len: usize,
    max_len: usize,
    field_name: &str,
) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.chars().count() < min_len {
        return Err(format!("{field_name} слишком короткое"));
    }
    Ok(trimmed.chars().take(max_len).collect())
}

fn sanitize_optional_text(value: Option<String>, max_len: usize) -> Option<String> {
    value
        .map(|raw| raw.trim().chars().take(max_len).collect::<String>())
        .and_then(|trimmed| {
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            }
        })
}

fn now_unix_millis() -> Result<i64, String> {
    Ok(SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "Не удалось вычислить системное время.".to_string())?
        .as_millis() as i64)
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Не удалось определить app data dir: {error}"))?;
    fs::create_dir_all(&path)
        .map_err(|error| format!("Не удалось создать app data dir: {error}"))?;
    Ok(path)
}

fn database_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_dir = app_data_dir(app)?;
    let next_path = app_dir.join(DATABASE_FILE_NAME);
    if next_path.exists() {
        return Ok(next_path);
    }
    let legacy_path_in_new_dir = app_dir.join(LEGACY_DATABASE_FILE_NAME);
    if legacy_path_in_new_dir.exists() {
        return Ok(legacy_path_in_new_dir);
    }
    if let Some(parent_dir) = app_dir.parent() {
        let legacy_app_dir = parent_dir.join(LEGACY_APP_IDENTIFIER);
        let legacy_path = legacy_app_dir.join(LEGACY_DATABASE_FILE_NAME);
        if legacy_path.exists() {
            return Ok(legacy_path);
        }
    }
    Ok(next_path)
}

fn default_seed_projects() -> Vec<Project> {
    vec![
        Project {
            id: "p_01".into(),
            name: "История основателя - выпуск 12".into(),
            description: "Нарративная сборка о запуске продукта и первых продажах.".into(),
            updated_at: "5 мин назад".into(),
            clips: 8,
            duration_seconds: 1520,
            status: "ready".into(),
            source_type: None,
            source_label: None,
            source_url: None,
            source_status: None,
            source_uploader: None,
            source_duration_seconds: None,
            source_thumbnail: None,
            source_view_count: None,
            source_like_count: None,
            source_comment_count: None,
            source_upload_date: None,
            source_channel_id: None,
            source_channel_url: None,
            source_channel_followers: None,
            imported_media_path: None,
        },
        Project {
            id: "p_02".into(),
            name: "Отзывы кампании".into(),
            description: "Реакции аудитории, сгруппированные по основным возражениям.".into(),
            updated_at: "18 мин назад".into(),
            clips: 5,
            duration_seconds: 940,
            status: "processing".into(),
            source_type: None,
            source_label: None,
            source_url: None,
            source_status: None,
            source_uploader: None,
            source_duration_seconds: None,
            source_thumbnail: None,
            source_view_count: None,
            source_like_count: None,
            source_comment_count: None,
            source_upload_date: None,
            source_channel_id: None,
            source_channel_url: None,
            source_channel_followers: None,
            imported_media_path: None,
        },
        Project {
            id: "p_03".into(),
            name: "Пакет подкаста креатора".into(),
            description: "Недельный набор вертикальных клипов для Shorts и TikTok.".into(),
            updated_at: "1 ч назад".into(),
            clips: 11,
            duration_seconds: 2840,
            status: "ready".into(),
            source_type: None,
            source_label: None,
            source_url: None,
            source_status: None,
            source_uploader: None,
            source_duration_seconds: None,
            source_thumbnail: None,
            source_view_count: None,
            source_like_count: None,
            source_comment_count: None,
            source_upload_date: None,
            source_channel_id: None,
            source_channel_url: None,
            source_channel_followers: None,
            imported_media_path: None,
        },
        Project {
            id: "p_04".into(),
            name: "Ключевые моменты вебинара".into(),
            description: "Сегменты по фичам с акцентом на CTA и выгоду.".into(),
            updated_at: "2 ч назад".into(),
            clips: 3,
            duration_seconds: 3210,
            status: "draft".into(),
            source_type: None,
            source_label: None,
            source_url: None,
            source_status: None,
            source_uploader: None,
            source_duration_seconds: None,
            source_thumbnail: None,
            source_view_count: None,
            source_like_count: None,
            source_comment_count: None,
            source_upload_date: None,
            source_channel_id: None,
            source_channel_url: None,
            source_channel_followers: None,
            imported_media_path: None,
        },
    ]
}

fn default_news_feed() -> Vec<NewsItem> {
    vec![
        NewsItem {
            id: "n_01".into(),
            label: "Рынок".into(),
            title: "Короткие форматы с экспертными монологами показывают рост досмотров.".into(),
            timestamp: "Сегодня".into(),
        },
        NewsItem {
            id: "n_02".into(),
            label: "Совет".into(),
            title: "Фиксируйте ключевые слова до генерации клипов, чтобы усилить релевантность."
                .into(),
            timestamp: "Сегодня".into(),
        },
        NewsItem {
            id: "n_03".into(),
            label: "Инсайт".into(),
            title: "Лучше всего работают клипы длиной 22-38 секунд с четким обещанием в начале."
                .into(),
            timestamp: "Вчера".into(),
        },
    ]
}

fn default_updates_feed() -> Vec<NewsItem> {
    vec![
        NewsItem {
            id: "u_01".into(),
            label: "Релиз".into(),
            title: "Семантический таймлайн теперь учитывает доверие к смысловым блокам.".into(),
            timestamp: "Сегодня".into(),
        },
        NewsItem {
            id: "u_02".into(),
            label: "Система".into(),
            title: "Генератор обложек получил быстрые шаблоны под TikTok и Shorts.".into(),
            timestamp: "Сегодня".into(),
        },
        NewsItem {
            id: "u_03".into(),
            label: "Интерфейс".into(),
            title: "Новый режим рабочего пространства сокращает визуальный шум при монтаже.".into(),
            timestamp: "2 дня назад".into(),
        },
    ]
}

fn initialize_database(connection: &Connection) -> Result<(), String> {
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
                source_like_count INTEGER,
                source_comment_count INTEGER,
                source_upload_date TEXT,
                source_channel_id TEXT,
                source_channel_url TEXT,
                source_channel_followers INTEGER,
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
        .map_err(|error| format!("Не удалось применить схему базы данных: {error}"))?;
    ensure_project_optional_columns(&connection)?;
    seed_projects_if_needed(&connection)?;
    Ok(())
}

fn open_database(app: &AppHandle) -> Result<Connection, String> {
    let db_path = database_path(app)?;
    let connection = Connection::open(&db_path)
        .map_err(|error| format!("Не удалось открыть базу данных {db_path:?}: {error}"))?;

    connection
        .execute_batch(
            r#"
            PRAGMA foreign_keys = ON;
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            "#,
        )
        .map_err(|error| format!("Не удалось применить PRAGMA базы данных: {error}"))?;

    let bootstrap_state = DB_BOOTSTRAP_STATE.get_or_init(|| Mutex::new(false));
    let mut initialized = bootstrap_state
        .lock()
        .map_err(|_| "Не удалось получить блокировку инициализации БД.".to_string())?;
    if !*initialized {
        initialize_database(&connection)?;
        *initialized = true;
    }

    Ok(connection)
}

fn ensure_project_optional_columns(connection: &Connection) -> Result<(), String> {
    let alter_statements = [
        "ALTER TABLE projects ADD COLUMN source_uploader TEXT",
        "ALTER TABLE projects ADD COLUMN source_duration_seconds INTEGER",
        "ALTER TABLE projects ADD COLUMN source_thumbnail TEXT",
        "ALTER TABLE projects ADD COLUMN source_view_count INTEGER",
        "ALTER TABLE projects ADD COLUMN source_like_count INTEGER",
        "ALTER TABLE projects ADD COLUMN source_comment_count INTEGER",
        "ALTER TABLE projects ADD COLUMN source_upload_date TEXT",
        "ALTER TABLE projects ADD COLUMN source_channel_id TEXT",
        "ALTER TABLE projects ADD COLUMN source_channel_url TEXT",
        "ALTER TABLE projects ADD COLUMN source_channel_followers INTEGER",
    ];

    for sql in alter_statements {
        if let Err(error) = connection.execute(sql, []) {
            let message = error.to_string().to_lowercase();
            if !message.contains("duplicate column name") {
                return Err(format!(
                    "Не удалось выполнить миграцию схемы projects: {error}"
                ));
            }
        }
    }

    Ok(())
}

fn seed_projects_if_needed(connection: &Connection) -> Result<(), String> {
    let count: i64 = connection
        .query_row("SELECT COUNT(*) FROM projects", [], |row| row.get(0))
        .map_err(|error| format!("Не удалось проверить проекты в базе данных: {error}"))?;
    if count > 0 {
        return Ok(());
    }

    let now = now_unix_millis()?;
    for (index, project) in default_seed_projects().into_iter().enumerate() {
        let offset = (index as i64) * 60_000;
        let updated = now - offset;
        let created = updated - 1000;
        connection
            .execute(
                r#"
                INSERT INTO projects (
                    id, name, description, updated_at, updated_at_unix, created_at_unix,
                    clips, duration_seconds, status, source_type, source_label, source_url,
                    source_status, source_uploader, source_duration_seconds, source_thumbnail,
                    source_view_count, source_like_count, source_comment_count, source_upload_date,
                    source_channel_id, source_channel_url, source_channel_followers,
                    imported_media_path
                )
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24)
                "#,
                params![
                    project.id,
                    project.name,
                    project.description,
                    project.updated_at,
                    updated,
                    created,
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
                    project.source_like_count.map(|value| value as i64),
                    project.source_comment_count.map(|value| value as i64),
                    project.source_upload_date,
                    project.source_channel_id,
                    project.source_channel_url,
                    project.source_channel_followers.map(|value| value as i64),
                    project.imported_media_path,
                ],
            )
            .map_err(|error| format!("Не удалось засеять проекты в базе данных: {error}"))?;
    }

    Ok(())
}

fn row_to_project(row: &rusqlite::Row<'_>) -> rusqlite::Result<Project> {
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
        source_like_count: row
            .get::<_, Option<i64>>("source_like_count")?
            .map(|value| value.max(0) as u64),
        source_comment_count: row
            .get::<_, Option<i64>>("source_comment_count")?
            .map(|value| value.max(0) as u64),
        source_upload_date: row.get("source_upload_date")?,
        source_channel_id: row.get("source_channel_id")?,
        source_channel_url: row.get("source_channel_url")?,
        source_channel_followers: row
            .get::<_, Option<i64>>("source_channel_followers")?
            .map(|value| value.max(0) as u64),
        imported_media_path: row.get("imported_media_path")?,
    })
}

fn load_projects(connection: &Connection) -> Result<Vec<Project>, String> {
    let mut statement = connection
        .prepare(
            r#"
            SELECT
              id, name, description, updated_at, clips, duration_seconds, status,
              source_type, source_label, source_url, source_status, source_uploader,
              source_duration_seconds, source_thumbnail, source_view_count, source_like_count,
              source_comment_count, source_upload_date, source_channel_id, source_channel_url,
              source_channel_followers, imported_media_path
            FROM projects
            ORDER BY updated_at_unix DESC, created_at_unix DESC
            "#,
        )
        .map_err(|error| format!("Не удалось подготовить запрос проектов: {error}"))?;

    let rows = statement
        .query_map([], row_to_project)
        .map_err(|error| format!("Не удалось загрузить проекты: {error}"))?;

    let mut projects: Vec<Project> = Vec::new();
    for row in rows {
        projects.push(row.map_err(|error| format!("Ошибка чтения проекта: {error}"))?);
    }
    Ok(projects)
}

fn load_project_by_id(
    connection: &Connection,
    project_id: &str,
) -> Result<Option<Project>, String> {
    connection
        .query_row(
            r#"
            SELECT
              id, name, description, updated_at, clips, duration_seconds, status,
              source_type, source_label, source_url, source_status, source_uploader,
              source_duration_seconds, source_thumbnail, source_view_count, source_like_count,
              source_comment_count, source_upload_date, source_channel_id, source_channel_url,
              source_channel_followers, imported_media_path
            FROM projects
            WHERE id = ?1
            "#,
            [project_id],
            row_to_project,
        )
        .optional()
        .map_err(|error| format!("Не удалось загрузить проект: {error}"))
}

fn validate_source_type(value: Option<String>) -> Option<String> {
    sanitize_optional_text(value, 24).and_then(|raw| {
        let normalized = raw.to_lowercase();
        if normalized == "local" || normalized == "youtube" {
            Some(normalized)
        } else {
            None
        }
    })
}

fn validate_source_status(value: Option<String>) -> Option<String> {
    sanitize_optional_text(value, 24).and_then(|raw| {
        let normalized = raw.to_lowercase();
        if normalized == "pending" || normalized == "ready" || normalized == "failed" {
            Some(normalized)
        } else {
            None
        }
    })
}

fn normalize_source_type_patch(value: String) -> Result<Option<String>, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    let normalized = trimmed.to_lowercase();
    if normalized == "local" || normalized == "youtube" {
        Ok(Some(normalized))
    } else {
        Err("Некорректный тип источника проекта.".to_string())
    }
}

fn normalize_source_status_patch(value: String) -> Result<Option<String>, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    let normalized = trimmed.to_lowercase();
    if normalized == "pending" || normalized == "ready" || normalized == "failed" {
        Ok(Some(normalized))
    } else {
        Err("Некорректный статус источника проекта.".to_string())
    }
}

fn normalize_project_status_patch(value: String) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("Статус проекта не может быть пустым.".to_string());
    }
    let normalized = trimmed.to_lowercase();
    if normalized == "ready" || normalized == "processing" || normalized == "draft" {
        Ok(normalized)
    } else {
        Err("Некорректный статус проекта.".to_string())
    }
}

fn is_sentence_boundary(value: &str) -> bool {
    value.ends_with('.') || value.ends_with('!') || value.ends_with('?')
}

fn semantic_meta(block_type: &str) -> (&'static str, &'static str, &'static str) {
    match block_type {
        "hook" => (
            "Хук",
            "Сильный вход с обещанием результата и триггером внимания.",
            "Запуск внимания",
        ),
        "story" => (
            "Контекст",
            "Смысловой слой, который удерживает и объясняет причину.",
            "Нарратив и контекст",
        ),
        "proof" => (
            "Доказательство",
            "Факт, пример или метрика, укрепляющие доверие.",
            "Подтверждение ценности",
        ),
        _ => (
            "Действие",
            "Ясный призыв и следующий шаг для зрителя.",
            "Призыв к действию",
        ),
    }
}

fn subtitle_presets() -> Vec<SubtitlePreset> {
    vec![
        SubtitlePreset {
            id: "sub_cinematic".into(),
            name: "Кинематографичный минимал".into(),
            description: "Мягкая тень, высокий контраст, плавная подача фраз.".into(),
            style_sample: "Именно здесь идея становится понятной.".into(),
        },
        SubtitlePreset {
            id: "sub_punch".into(),
            name: "Акцентные слова".into(),
            description: "Ключевые слова деликатно усиливаются в ритме речи.".into(),
            style_sample: "Достаточно одного сильного хука.".into(),
        },
        SubtitlePreset {
            id: "sub_editorial".into(),
            name: "Редакционный стиль".into(),
            description: "Премиальная типографика для экспертного повествования.".into(),
            style_sample: "Аудитория запоминает эмоциональную ясность.".into(),
        },
        SubtitlePreset {
            id: "sub_clean".into(),
            name: "Чистый универсальный".into(),
            description: "Компактная подача для плотного информационного контента.".into(),
            style_sample: "Преобразуйте инсайт в конкретное действие.".into(),
        },
    ]
}

fn platform_presets() -> Vec<PlatformPreset> {
    vec![
        PlatformPreset {
            id: "pf_tiktok".into(),
            name: "TikTok".into(),
            aspect: "9:16".into(),
            max_duration: "60 с".into(),
            description: "Быстрый хук, безопасные поля под субтитры, динамичный темп.".into(),
        },
        PlatformPreset {
            id: "pf_shorts".into(),
            name: "Shorts".into(),
            aspect: "9:16".into(),
            max_duration: "60 с".into(),
            description: "Ритм под удержание и прямой CTA в финале.".into(),
        },
        PlatformPreset {
            id: "pf_reels".into(),
            name: "Reels".into(),
            aspect: "9:16".into(),
            max_duration: "90 с".into(),
            description: "Историйная подача и чистые нижние подписи.".into(),
        },
        PlatformPreset {
            id: "pf_telegram".into(),
            name: "Telegram".into(),
            aspect: "16:9".into(),
            max_duration: "120 с".into(),
            description: "Более контекстный формат для канала и объясняющих нарезок.".into(),
        },
    ]
}

fn make_mock_transcript(duration: f64) -> Vec<TranscriptWord> {
    let safe_duration = duration.max(45.0);
    let tokens: Vec<&str> = SCRIPT.split_whitespace().collect();
    let desired_word_count = ((safe_duration * 2.7).floor() as usize).clamp(220, 3200);
    let repeated_tokens: Vec<&str> = (0..desired_word_count)
        .map(|index| tokens[index % tokens.len()])
        .collect();
    let base_step = safe_duration / (repeated_tokens.len() as f64 + 6.0);

    repeated_tokens
        .iter()
        .enumerate()
        .map(|(index, text)| {
            let drift = (index % 4) as f64 * 0.02;
            let start = index as f64 * base_step + drift;
            let end = (start + base_step * 0.92).min(safe_duration);
            TranscriptWord {
                id: format!("w_{index}"),
                text: (*text).to_string(),
                start,
                end,
            }
        })
        .collect()
}

fn build_semantic_blocks(duration: f64) -> Vec<SemanticBlock> {
    let safe_duration = duration.max(60.0);
    let block_count = ((safe_duration / 36.0).round() as usize).clamp(4, 9);
    let block_size = safe_duration / block_count as f64;

    (0..block_count)
        .map(|index| {
            let block_type = BLOCK_TYPE_CYCLE[index % BLOCK_TYPE_CYCLE.len()];
            let (label, summary, _) = semantic_meta(block_type);
            let start = index as f64 * block_size;
            let end = (start + block_size).min(safe_duration);
            let confidence = clamp_u8(
                (89.0 - (((index % 4) as f64 * 4.0) + index as f64 * 0.8)).round() as i32,
                72,
                92,
            );

            SemanticBlock {
                id: format!("sb_{index}"),
                label: format!("{label} {}", index + 1),
                start,
                end,
                block_type: block_type.to_string(),
                confidence,
                summary: summary.to_string(),
            }
        })
        .collect()
}

fn build_transcript_blocks(words: &[TranscriptWord]) -> Vec<TranscriptSemanticBlock> {
    if words.is_empty() {
        return vec![];
    }

    let mut blocks: Vec<TranscriptSemanticBlock> = Vec::new();
    let mut word_start = 0usize;

    for index in 0..words.len() {
        let size = index - word_start + 1;
        let natural_boundary = is_sentence_boundary(&words[index].text) && size >= 8;
        let hard_boundary = size >= 22;
        let is_last = index + 1 == words.len();

        if !natural_boundary && !hard_boundary && !is_last {
            continue;
        }

        let block_type = BLOCK_TYPE_CYCLE[blocks.len() % BLOCK_TYPE_CYCLE.len()];
        let (label, summary, _) = semantic_meta(block_type);
        let confidence = clamp_u8(91 - ((blocks.len() % 5) as i32 * 3), 73, 94);

        blocks.push(TranscriptSemanticBlock {
            id: format!("tsb_{}", blocks.len()),
            label: format!("{label} {}", blocks.len() + 1),
            start: words[word_start].start,
            end: words[index].end,
            block_type: block_type.to_string(),
            confidence,
            summary: summary.to_string(),
            word_start,
            word_end: index,
        });
        word_start = index + 1;
    }

    if blocks.len() < 2 {
        return blocks;
    }

    let mut merged: Vec<TranscriptSemanticBlock> = Vec::new();
    for block in blocks {
        let can_merge_with_previous = merged
            .last()
            .map(|previous| {
                block.end - block.start < 1.2 && previous.block_type == block.block_type
            })
            .unwrap_or(false);

        if can_merge_with_previous {
            if let Some(previous) = merged.last_mut() {
                previous.end = block.end;
                previous.word_end = block.word_end;
                previous.confidence = (((previous.confidence as u16 + block.confidence as u16) / 2)
                    as u8)
                    .clamp(0, 100);
            }
            continue;
        }

        merged.push(block);
    }

    merged
        .into_iter()
        .enumerate()
        .map(|(index, mut block)| {
            let (label, _, _) = semantic_meta(&block.block_type);
            block.id = format!("tsb_{index}");
            block.label = format!("{label} {}", index + 1);
            block
        })
        .collect()
}

fn compute_viral_score(words: &[TranscriptWord]) -> u8 {
    if words.is_empty() {
        return 0;
    }

    let density = (words.len() as f64 / 120.0).min(1.0);
    let punctuation_boost = words
        .iter()
        .filter(|word| is_sentence_boundary(&word.text))
        .count() as f64
        / words.len() as f64;
    let energetic_words = words
        .iter()
        .filter(|word| {
            let text = word.text.to_lowercase();
            text.contains("сильн")
                || text.contains("один")
                || text.contains("ясн")
                || text.contains("пик")
                || text.contains("луч")
                || text.contains("быстр")
                || text.contains("хук")
                || text.contains("результат")
                || text.contains("вниман")
                || text.contains("удерж")
        })
        .count();
    let energetic_boost = (energetic_words as f64 / 22.0).min(1.0);

    clamp_u8(
        (58.0 + density * 18.0 + punctuation_boost * 11.0 + energetic_boost * 13.0).round() as i32,
        0,
        100,
    )
}

fn build_viral_insights(score: u8) -> Vec<ViralInsight> {
    vec![
        ViralInsight {
            id: "vi_hook_density".into(),
            title: "Плотность хуков выше медианы ниши".into(),
            impact: "High".into(),
            detail: format!(
                "Профиль первых секунд попадает в верхние {}% по вероятности удержания.",
                (100 - score).max(8)
            ),
        },
        ViralInsight {
            id: "vi_pacing".into(),
            title: "Ритм фраз поддерживает повторные просмотры".into(),
            impact: "Medium".into(),
            detail: "Переходы между предложениями компактные, риск потери внимания после 7-й секунды низкий."
                .into(),
        },
        ViralInsight {
            id: "vi_clarity".into(),
            title: "Формулировку выгоды стоит усилить в финале".into(),
            impact: "Medium".into(),
            detail: "Добавьте явный результат в последние 20% клипа для роста намерения досмотреть до конца."
                .into(),
        },
    ]
}

fn build_hook_candidates(
    project_name: &str,
    source_words: &[TranscriptWord],
) -> Vec<HookCandidate> {
    let seed_phrase = source_words
        .iter()
        .take(12)
        .map(|word| word.text.as_str())
        .collect::<Vec<_>>()
        .join(" ");
    let compact_seed: String = seed_phrase.chars().take(64).collect();

    vec![
        HookCandidate {
            id: "hk_1".into(),
            headline: "Одна правка изменила то, как досматривают это видео".into(),
            reasoning: "Формулировка трансформации усиливает удержание в первые 3 секунды.".into(),
            predicted_lift: "+18% удержание".into(),
            tone: "Bold".into(),
        },
        HookCandidate {
            id: "hk_2".into(),
            headline: "Прежде чем публиковать клип, проверьте эту ошибку тайминга".into(),
            reasoning: "Рамка риска + прикладная польза повышают вероятность открытия.".into(),
            predicted_lift: "+12% открытие".into(),
            tone: "Direct".into(),
        },
        HookCandidate {
            id: "hk_3".into(),
            headline: format!("Из \"{project_name}\" в 30-секундную историю с высокой конверсией"),
            reasoning: "Упоминание источника повышает релевантность и доверие.".into(),
            predicted_lift: "+16% досмотр".into(),
            tone: "Data-led".into(),
        },
        HookCandidate {
            id: "hk_4".into(),
            headline: format!("Самый пересматриваемый момент начинается здесь: {compact_seed}..."),
            reasoning: "Незавершенный контекст создает эффект ожидания и усиливает интерес.".into(),
            predicted_lift: "+14% повтор".into(),
            tone: "Reflective".into(),
        },
    ]
}

fn build_content_plan_ideas(project_name: &str, hooks: &[HookCandidate]) -> Vec<ContentPlanIdea> {
    vec![
        ContentPlanIdea {
            id: "cp_1".into(),
            title: "Мини-серия «Миф / Реальность»".into(),
            angle: "Каждый эпизод закрывает одно возражение аудитории через доказательство.".into(),
            channels: vec!["Reels".into(), "Shorts".into(), "TikTok".into()],
            script_outline:
                "Миф -> 2 секунды опровержения -> фрагмент доказательства -> один практический вывод."
                    .into(),
        },
        ContentPlanIdea {
            id: "cp_2".into(),
            title: "Микро-уроки основателя".into(),
            angle: format!("Преобразовать \"{project_name}\" в пять стратегических микро-историй."),
            channels: vec!["Shorts".into(), "Telegram".into()],
            script_outline:
                "Ситуация -> решение -> результат -> короткая рефлексия, усиливающая экспертность."
                    .into(),
        },
        ContentPlanIdea {
            id: "cp_3".into(),
            title: format!(
                "Лестница хуков от \"{}\"",
                hooks.first().map(|hook| hook.headline.as_str()).unwrap_or("основной идеи")
            ),
            angle: "Публикация трех версий одного смыслового блока с разным входом.".into(),
            channels: vec!["TikTok".into(), "Reels".into()],
            script_outline:
                "Версия A (любопытство) -> Версия B (проблема) -> Версия C (доказательство в начале)."
                    .into(),
        },
    ]
}

fn build_series_segments(blocks: &[SemanticBlock], duration: f64) -> Vec<SeriesSegment> {
    let safe_duration = duration.max(60.0);
    blocks
        .iter()
        .take(4)
        .enumerate()
        .map(|(index, block)| {
            let (_, _, theme) = semantic_meta(&block.block_type);
            SeriesSegment {
                id: format!("seg_{index}"),
                title: format!("Эпизод {}", index + 1),
                start: (block.start - 0.8).max(0.0),
                end: (block.end + 0.8).min(safe_duration),
                theme: theme.to_string(),
                rationale: block.summary.clone(),
            }
        })
        .collect()
}

fn build_thumbnail_templates(project_name: &str, duration: f64) -> Vec<ThumbnailTemplate> {
    vec![
        ThumbnailTemplate {
            id: "th_1".into(),
            name: "Серебряный фокус".into(),
            overlay_title: "Этот момент меняет все".into(),
            overlay_subtitle: project_name.to_string(),
            focus_time: (duration * 0.16).max(2.0),
            palette: ["#dfe6f3".into(), "#78839a".into()],
        },
        ThumbnailTemplate {
            id: "th_2".into(),
            name: "Редакционный контраст".into(),
            overlay_title: "Инсайт за 10 секунд".into(),
            overlay_subtitle: "Стратегия удержания".into(),
            focus_time: (duration * 0.3).max(4.0),
            palette: ["#edf2fb".into(), "#5f6c86".into()],
        },
        ThumbnailTemplate {
            id: "th_3".into(),
            name: "Уверенный кадр".into(),
            overlay_title: "Сделайте это до публикации".into(),
            overlay_subtitle: "Интеллект Cursed Clipper".into(),
            focus_time: (duration * 0.45).max(5.0),
            palette: ["#f4f7ff".into(), "#6f7d96".into()],
        },
    ]
}

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
    source_like_count: Option<u64>,
    source_comment_count: Option<u64>,
    source_upload_date: Option<String>,
    source_channel_id: Option<String>,
    source_channel_url: Option<String>,
    source_channel_followers: Option<u64>,
    imported_media_path: Option<String>,
) -> Result<Project, String> {
    let safe_name = sanitize_text(name, 3, 90, "Название проекта")?;
    let safe_description = sanitize_text(description, 12, 220, "Описание проекта")?;
    let safe_source_type = validate_source_type(source_type);
    let safe_source_status = validate_source_status(source_status);
    let safe_source_label = sanitize_optional_text(source_label, 140);
    let safe_source_url = sanitize_optional_text(source_url, 512);
    let safe_source_uploader = sanitize_optional_text(source_uploader, 180);
    let safe_source_duration_seconds = source_duration_seconds.map(|value| value.min(60 * 60 * 10));
    let safe_source_thumbnail = sanitize_optional_text(source_thumbnail, 512);
    let safe_source_view_count = source_view_count;
    let safe_source_like_count = source_like_count;
    let safe_source_comment_count = source_comment_count;
    let safe_source_upload_date = sanitize_optional_text(source_upload_date, 64);
    let safe_source_channel_id = sanitize_optional_text(source_channel_id, 128);
    let safe_source_channel_url = sanitize_optional_text(source_channel_url, 512);
    let safe_source_channel_followers = source_channel_followers;
    let safe_imported_media_path = sanitize_optional_text(imported_media_path, 512);
    let now = now_unix_millis()?;
    let project = Project {
        id: format!("p_{now}"),
        name: safe_name,
        description: safe_description,
        updated_at: "только что".into(),
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
        source_like_count: safe_source_like_count,
        source_comment_count: safe_source_comment_count,
        source_upload_date: safe_source_upload_date,
        source_channel_id: safe_source_channel_id,
        source_channel_url: safe_source_channel_url,
        source_channel_followers: safe_source_channel_followers,
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
              source_view_count, source_like_count, source_comment_count, source_upload_date,
              source_channel_id, source_channel_url, source_channel_followers,
              imported_media_path
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24)
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
                project.source_like_count.map(|value| value as i64),
                project.source_comment_count.map(|value| value as i64),
                project.source_upload_date,
                project.source_channel_id,
                project.source_channel_url,
                project.source_channel_followers.map(|value| value as i64),
                project.imported_media_path,
            ],
        )
        .map_err(|error| format!("Не удалось сохранить проект в базе данных: {error}"))?;

    Ok(project)
}

#[tauri::command]
pub fn patch_project(
    app: AppHandle,
    project_id: String,
    patch: ProjectPatch,
) -> Result<Project, String> {
    let safe_project_id = sanitize_text(project_id, 3, 120, "Идентификатор проекта")?;
    let connection = open_database(&app)?;
    let mut project = load_project_by_id(&connection, &safe_project_id)?
        .ok_or_else(|| "Проект не найден.".to_string())?;

    if let Some(name) = patch.name {
        project.name = sanitize_text(name, 3, 90, "Название проекта")?;
    }
    if let Some(description) = patch.description {
        project.description = sanitize_text(description, 12, 220, "Описание проекта")?;
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
    if let Some(source_like_count) = patch.source_like_count {
        project.source_like_count = Some(source_like_count);
    }
    if let Some(source_comment_count) = patch.source_comment_count {
        project.source_comment_count = Some(source_comment_count);
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
    if let Some(imported_media_path) = patch.imported_media_path {
        project.imported_media_path = sanitize_optional_text(Some(imported_media_path), 512);
    }

    project.updated_at =
        sanitize_optional_text(patch.updated_at, 32).unwrap_or("только что".into());
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
              source_like_count = ?17,
              source_comment_count = ?18,
              source_upload_date = ?19,
              source_channel_id = ?20,
              source_channel_url = ?21,
              source_channel_followers = ?22,
              imported_media_path = ?23
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
                project.source_like_count.map(|value| value as i64),
                project.source_comment_count.map(|value| value as i64),
                project.source_upload_date,
                project.source_channel_id,
                project.source_channel_url,
                project.source_channel_followers.map(|value| value as i64),
                project.imported_media_path,
            ],
        )
        .map_err(|error| format!("Не удалось обновить проект: {error}"))?;

    Ok(project)
}

#[tauri::command]
pub fn delete_project(app: AppHandle, project_id: String) -> Result<bool, String> {
    let safe_project_id = sanitize_text(project_id, 3, 120, "Идентификатор проекта")?;
    let connection = open_database(&app)?;
    let removed = connection
        .execute("DELETE FROM projects WHERE id = ?1", [safe_project_id])
        .map_err(|error| format!("Не удалось удалить проект: {error}"))?;
    Ok(removed > 0)
}

#[tauri::command]
pub fn save_project_workspace_state(
    app: AppHandle,
    project_id: String,
    state_json: String,
) -> Result<(), String> {
    let safe_project_id = sanitize_text(project_id, 3, 120, "Идентификатор проекта")?;
    if state_json.len() > 32_000_000 {
        return Err("Состояние проекта слишком большое для сохранения.".to_string());
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
        .map_err(|error| format!("Не удалось сохранить состояние проекта: {error}"))?;
    Ok(())
}

#[tauri::command]
pub fn load_project_workspace_state(
    app: AppHandle,
    project_id: String,
) -> Result<Option<String>, String> {
    let safe_project_id = sanitize_text(project_id, 3, 120, "Идентификатор проекта")?;
    let connection = open_database(&app)?;
    connection
        .query_row(
            "SELECT state_json FROM workspace_states WHERE project_id = ?1",
            [safe_project_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| format!("Не удалось загрузить состояние проекта: {error}"))
}

#[tauri::command]
pub fn save_project_resume_state(
    app: AppHandle,
    project_id: String,
    active_mode: String,
    current_time: f64,
    active_clip_id: Option<String>,
) -> Result<ProjectResumeState, String> {
    let safe_project_id = sanitize_text(project_id, 3, 120, "Идентификатор проекта")?;
    let safe_active_mode = sanitize_text(active_mode, 3, 32, "Режим проекта")?;
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
        .map_err(|error| format!("Не удалось сохранить точку продолжения: {error}"))?;

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
    let safe_project_id = sanitize_text(project_id, 3, 120, "Идентификатор проекта")?;
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
        .map_err(|error| format!("Не удалось загрузить точку продолжения: {error}"))
}

#[tauri::command]
pub fn generate_workspace_mock(
    project_name: String,
    duration: f64,
) -> Result<WorkspaceMockPayload, String> {
    let safe_project_name = if project_name.trim().is_empty() {
        "Новый проект".to_string()
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
        return Err("Недостаточно данных для генерации хуков".into());
    }
    let safe_project_name = if project_name.trim().is_empty() {
        "Новый проект".to_string()
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
        "Новый проект".to_string()
    } else {
        project_name.trim().chars().take(120).collect()
    };
    let safe_duration = clamp_f64(duration, 10.0, 10_800.0);
    Ok(build_thumbnail_templates(&safe_project_name, safe_duration))
}
