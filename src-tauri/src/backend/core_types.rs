// Shared backend DTOs and immutable defaults used by commands and DB helpers.
use super::*;

pub(super) const SCRIPT: &str = "the model has already identified the strongest hooks in this interview and ranked them by emotional clarity and retention potential. now you can remove pauses, align pacing, and prepare versions for reels, shorts, telegram, and vertical publishing. while analysis is running, mark key phrases, note semantic turns, and preserve speaker energy peaks. every word in this panel is time-aligned, so clips can be assembled precisely even before the final render.";
pub(super) const BLOCK_TYPE_CYCLE: [&str; 4] = ["hook", "story", "proof", "cta"];
pub(super) const DATABASE_FILE_NAME: &str = "cursed-clipper-state.sqlite3";
// Keep legacy file name so existing installs continue using previous DB.
pub(super) const LEGACY_DATABASE_FILE_NAME: &str = "clipforge-state.sqlite3";
pub(super) const LEGACY_APP_IDENTIFIER: &str = "com.clipforge.studio";
pub(super) static DB_BOOTSTRAP_STATE: OnceLock<Mutex<bool>> = OnceLock::new();

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
    pub source_view_count_previous: Option<u64>,
    pub source_like_count: Option<u64>,
    pub source_like_count_previous: Option<u64>,
    pub source_comment_count: Option<u64>,
    pub source_comment_count_previous: Option<u64>,
    pub source_upload_date: Option<String>,
    pub source_channel_id: Option<String>,
    pub source_channel_url: Option<String>,
    pub source_channel_followers: Option<u64>,
    pub source_channel_followers_previous: Option<u64>,
    pub source_metrics_updated_at: Option<String>,
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
pub struct SubtitlePreset {
    pub id: String,
    pub name: String,
    pub description: String,
    pub style_sample: String,
    pub render_profile: SubtitleRenderProfile,
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
    pub source_view_count_previous: Option<u64>,
    pub source_like_count: Option<u64>,
    pub source_like_count_previous: Option<u64>,
    pub source_comment_count: Option<u64>,
    pub source_comment_count_previous: Option<u64>,
    pub source_upload_date: Option<String>,
    pub source_channel_id: Option<String>,
    pub source_channel_url: Option<String>,
    pub source_channel_followers: Option<u64>,
    pub source_channel_followers_previous: Option<u64>,
    pub source_metrics_updated_at: Option<String>,
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

pub(super) fn clamp_f64(value: f64, min: f64, max: f64) -> f64 {
    value.min(max).max(min)
}

pub(super) fn clamp_u8(value: i32, min: i32, max: i32) -> u8 {
    value.clamp(min, max) as u8
}

pub(super) fn sanitize_text(
    value: String,
    min_len: usize,
    max_len: usize,
    field_name: &str,
) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.chars().count() < min_len {
        return Err(format!("{field_name} is too short"));
    }
    Ok(trimmed.chars().take(max_len).collect())
}

pub(super) fn sanitize_optional_text(value: Option<String>, max_len: usize) -> Option<String> {
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

pub(super) fn now_unix_millis() -> Result<i64, String> {
    Ok(SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "Failed to compute system time.".to_string())?
        .as_millis() as i64)
}

pub(super) fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data dir: {error}"))?;
    fs::create_dir_all(&path).map_err(|error| format!("Failed to create app data dir: {error}"))?;
    Ok(path)
}

pub(super) fn database_path(app: &AppHandle) -> Result<PathBuf, String> {
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

pub(super) fn default_news_feed() -> Vec<NewsItem> {
    vec![
        NewsItem {
            id: "n_01".into(),
            label: "Market".into(),
            title: "Short-form expert monologues are showing higher completion rates.".into(),
            timestamp: "Today".into(),
        },
        NewsItem {
            id: "n_02".into(),
            label: "Tip".into(),
            title: "Lock key phrases before clip generation to improve relevance.".into(),
            timestamp: "Today".into(),
        },
        NewsItem {
            id: "n_03".into(),
            label: "Insight".into(),
            title:
                "Clips in the 22-38 second range perform best when the opening promise is explicit."
                    .into(),
            timestamp: "Yesterday".into(),
        },
    ]
}

pub(super) fn default_updates_feed() -> Vec<NewsItem> {
    vec![
        NewsItem {
            id: "u_01".into(),
            label: "Release".into(),
            title: "Semantic timeline now factors confidence for semantic blocks.".into(),
            timestamp: "Today".into(),
        },
        NewsItem {
            id: "u_02".into(),
            label: "System".into(),
            title: "Thumbnail generator now includes quick templates for TikTok and Shorts.".into(),
            timestamp: "Today".into(),
        },
        NewsItem {
            id: "u_03".into(),
            label: "Interface".into(),
            title: "The new workspace mode reduces visual noise during editing.".into(),
            timestamp: "2 days ago".into(),
        },
    ]
}
