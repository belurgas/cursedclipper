// Clip export/subtitle rendering pipeline used by batch export command.
use super::*;

pub(super) fn sanitize_short_text(value: Option<String>, max_len: usize) -> Option<String> {
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

pub(super) fn parse_aspect_ratio(value: &str) -> Option<f64> {
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

pub(super) fn pick_render_resolution(aspect: &str) -> (u32, u32) {
    let ratio = parse_aspect_ratio(aspect).unwrap_or(16.0 / 9.0);
    if ratio <= 0.68 {
        return (1080, 1920);
    }
    if ratio >= 1.35 {
        return (1920, 1080);
    }
    (1080, 1080)
}

pub(super) fn normalize_target_dimension(value: u32) -> Option<u32> {
    if !(240..=4320).contains(&value) {
        return None;
    }
    let even = if value % 2 == 0 { value } else { value - 1 };
    if even < 240 {
        return None;
    }
    Some(even)
}

pub(super) fn normalize_target_dimension_from_f64(value: f64) -> Option<u32> {
    if !value.is_finite() {
        return None;
    }
    let rounded = value.round();
    if rounded < 2.0 {
        return None;
    }
    normalize_target_dimension(rounded as u32)
}

pub(super) fn align_resolution_to_aspect(aspect: &str, width: u32, height: u32) -> (u32, u32) {
    let target_ratio = parse_aspect_ratio(aspect).unwrap_or(width as f64 / height as f64);
    if target_ratio <= 0.0 {
        return (width, height);
    }
    let actual_ratio = width as f64 / height as f64;
    let ratio_delta = (actual_ratio - target_ratio).abs() / target_ratio.max(0.000_1);
    if ratio_delta <= 0.03 {
        return (width, height);
    }

    let width_based_height = normalize_target_dimension_from_f64(width as f64 / target_ratio);
    let height_based_width = normalize_target_dimension_from_f64(height as f64 * target_ratio);

    let width_candidate = width_based_height.map(|candidate_height| (width, candidate_height));
    let height_candidate = height_based_width.map(|candidate_width| (candidate_width, height));

    let score = |candidate: (u32, u32)| -> f64 {
        let (candidate_w, candidate_h) = candidate;
        let ratio_error = ((candidate_w as f64 / candidate_h as f64) - target_ratio).abs()
            / target_ratio.max(0.000_1);
        let size_error = ((candidate_w as i64 - width as i64).abs()
            + (candidate_h as i64 - height as i64).abs()) as f64;
        ratio_error * 10_000.0 + size_error
    };

    match (width_candidate, height_candidate) {
        (Some(left), Some(right)) => {
            if score(left) <= score(right) {
                left
            } else {
                right
            }
        }
        (Some(candidate), None) | (None, Some(candidate)) => candidate,
        (None, None) => pick_render_resolution(aspect),
    }
}

pub(super) fn pick_render_resolution_with_override(
    aspect: &str,
    output_width: Option<u32>,
    output_height: Option<u32>,
) -> (u32, u32) {
    if let (Some(raw_width), Some(raw_height)) = (output_width, output_height) {
        if let (Some(width), Some(height)) = (
            normalize_target_dimension(raw_width),
            normalize_target_dimension(raw_height),
        ) {
            return align_resolution_to_aspect(aspect, width, height);
        }
    }
    pick_render_resolution(aspect)
}

pub(super) fn clamp_export_time(value: f64) -> f64 {
    if !value.is_finite() {
        return 0.0;
    }
    value.clamp(0.0, 60.0 * 60.0 * 10.0)
}

pub(super) fn validate_export_path(raw: &str) -> Result<PathBuf, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("Source video path is missing.".to_string());
    }
    if trimmed.len() > 2048 {
        return Err("Video path is too long.".to_string());
    }
    let normalized = trimmed.strip_prefix("\\\\?\\").unwrap_or(trimmed);
    let path = PathBuf::from(normalized);
    if !path.exists() || !path.is_file() {
        return Err("Source video file was not found.".to_string());
    }
    canonicalize_existing_path(&path)
}

pub(super) fn compute_export_base_dir(
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
    Ok(projects_root
        .join(sanitize_project_name(project_name))
        .join("exports"))
}

pub(super) fn ensure_unique_export_file_path(base: &Path, stem: &str, ext: &str) -> PathBuf {
    let extension = if ext.trim().is_empty() {
        "mp4"
    } else {
        ext.trim()
    };
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

#[derive(Debug, Clone)]
pub(super) struct ClipSubtitleWord {
    text: String,
    start: f64,
    end: f64,
    emphasis: bool,
}

pub(super) fn normalize_subtitle_word_text(value: &str, all_caps: bool) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let collapsed = trimmed
        .split_whitespace()
        .collect::<Vec<&str>>()
        .join(" ")
        .replace(['\n', '\r'], " ")
        .replace('{', "(")
        .replace('}', ")");
    if all_caps {
        collapsed.to_uppercase()
    } else {
        collapsed
    }
}

pub(super) fn is_sentence_boundary_token(value: &str) -> bool {
    value.ends_with('.') || value.ends_with('!') || value.ends_with('?') || value.ends_with('…')
}

pub(super) fn is_emphasis_candidate(value: &str) -> bool {
    let letters_count = value.chars().filter(|ch| ch.is_alphabetic()).count();
    if letters_count < 5 {
        return false;
    }
    if letters_count >= 8 {
        return true;
    }
    let has_digit = value.chars().any(|ch| ch.is_ascii_digit());
    let uppercase_ratio = {
        let uppercase_count = value.chars().filter(|ch| ch.is_uppercase()).count();
        uppercase_count as f64 / letters_count as f64
    };
    has_digit || uppercase_ratio >= 0.55
}

pub(super) fn parse_hex_rgb(value: &str) -> Option<(u8, u8, u8)> {
    let normalized = value.trim().trim_start_matches('#');
    if normalized.len() != 6 || !normalized.chars().all(|ch| ch.is_ascii_hexdigit()) {
        return None;
    }
    let r = u8::from_str_radix(&normalized[0..2], 16).ok()?;
    let g = u8::from_str_radix(&normalized[2..4], 16).ok()?;
    let b = u8::from_str_radix(&normalized[4..6], 16).ok()?;
    Some((r, g, b))
}

pub(super) fn ass_color(value: &str, fallback: &str) -> String {
    let (r, g, b) = parse_hex_rgb(value)
        .or_else(|| parse_hex_rgb(fallback))
        .unwrap_or((255, 255, 255));
    format!("&H00{:02X}{:02X}{:02X}", b, g, r)
}

pub(super) fn ass_back_color(value: &str, fallback: &str, alpha: u8) -> String {
    let (r, g, b) = parse_hex_rgb(value)
        .or_else(|| parse_hex_rgb(fallback))
        .unwrap_or((0, 0, 0));
    format!("&H{:02X}{:02X}{:02X}{:02X}", alpha, b, g, r)
}

pub(super) fn ass_timestamp(seconds: f64) -> String {
    let clamped = seconds.max(0.0);
    let total_cs = (clamped * 100.0).round() as u64;
    let cs = total_cs % 100;
    let total_secs = total_cs / 100;
    let secs = total_secs % 60;
    let total_mins = total_secs / 60;
    let mins = total_mins % 60;
    let hours = total_mins / 60;
    format!("{hours}:{mins:02}:{secs:02}.{cs:02}")
}

pub(super) fn subtitle_alignment(position: &str) -> u32 {
    match position.trim().to_lowercase().as_str() {
        "top" => 8,
        "center" => 5,
        _ => 2,
    }
}

pub(super) fn escape_ffmpeg_filter_path(path: &Path) -> String {
    let normalized = path.to_string_lossy().replace('\\', "/");
    let mut escaped = String::with_capacity(normalized.len() + 12);
    for ch in normalized.chars() {
        match ch {
            ':' => escaped.push_str("\\:"),
            '\'' => escaped.push_str("\\'"),
            ',' => escaped.push_str("\\,"),
            ';' => escaped.push_str("\\;"),
            '[' => escaped.push_str("\\["),
            ']' => escaped.push_str("\\]"),
            _ => escaped.push(ch),
        }
    }
    escaped
}

pub(super) fn push_chunk(
    chunks: &mut Vec<Vec<ClipSubtitleWord>>,
    current: &mut Vec<ClipSubtitleWord>,
) {
    if current.is_empty() {
        return;
    }
    chunks.push(std::mem::take(current));
}

pub(super) fn split_chunk_into_lines(
    chunk: &[ClipSubtitleWord],
    max_words_per_line: usize,
    max_chars_per_line: usize,
    max_lines: usize,
) -> Vec<Vec<ClipSubtitleWord>> {
    if chunk.is_empty() {
        return Vec::new();
    }
    let mut lines: Vec<Vec<ClipSubtitleWord>> = Vec::new();
    let mut current_line: Vec<ClipSubtitleWord> = Vec::new();
    let mut current_chars = 0_usize;

    for word in chunk {
        let additional = if current_line.is_empty() {
            word.text.chars().count()
        } else {
            word.text.chars().count() + 1
        };
        let exceeds_word_count = current_line.len() >= max_words_per_line;
        let exceeds_char_count = current_chars + additional > max_chars_per_line;
        if !current_line.is_empty() && (exceeds_word_count || exceeds_char_count) {
            lines.push(std::mem::take(&mut current_line));
            current_chars = 0;
        }
        current_chars += if current_line.is_empty() {
            word.text.chars().count()
        } else {
            word.text.chars().count() + 1
        };
        current_line.push(word.clone());
    }
    if !current_line.is_empty() {
        lines.push(current_line);
    }
    if lines.len() <= max_lines {
        return lines;
    }

    let mut compacted: Vec<Vec<ClipSubtitleWord>> = lines.into_iter().take(max_lines).collect();
    let overflow = chunk
        .iter()
        .skip(compacted.iter().map(|line| line.len()).sum::<usize>())
        .cloned()
        .collect::<Vec<_>>();
    if let Some(last_line) = compacted.last_mut() {
        last_line.extend(overflow);
    }
    compacted
}

pub(super) fn build_subtitle_event_text(
    lines: &[Vec<ClipSubtitleWord>],
    profile: &SubtitleRenderProfile,
    secondary_ass_color: &str,
) -> String {
    let animation = profile.animation.trim().to_lowercase();
    let mut line_texts: Vec<String> = Vec::with_capacity(lines.len());
    for line in lines {
        let mut line_text = String::new();
        for (index, word) in line.iter().enumerate() {
            if index > 0 {
                line_text.push(' ');
            }
            let word_duration_cs = (((word.end - word.start) * 100.0).round() as i32).clamp(4, 220);
            if animation == "karaoke" || animation == "word-pop" {
                if animation == "word-pop" {
                    line_text.push_str(&format!(
                        "{{\\k{word_duration_cs}\\t(0,120,\\fscx114\\fscy114)\\t(120,240,\\fscx100\\fscy100)}}"
                    ));
                } else {
                    line_text.push_str(&format!("{{\\k{word_duration_cs}}}"));
                }
            }
            if profile.highlight_important_words && word.emphasis {
                line_text.push_str(&format!(
                    "{{\\c{secondary_ass_color}\\b1}}{}{{\\rCCMain}}",
                    word.text
                ));
            } else {
                line_text.push_str(&word.text);
            }
        }
        line_texts.push(line_text);
    }
    let fade_in = profile.fade_in_ms.clamp(0, 900);
    let fade_out = profile.fade_out_ms.clamp(0, 900);
    format!("{{\\fad({fade_in},{fade_out})}}{}", line_texts.join("\\N"))
}

#[derive(Debug, Clone, Copy)]
pub(super) struct ClipSubtitleRenderContext {
    clip_start: f64,
    clip_end: f64,
    target_w: u32,
    target_h: u32,
    subtitle_offset_x: f64,
    subtitle_offset_y: f64,
    subtitle_box_width: f64,
    subtitle_box_height: f64,
}

pub(super) fn build_clip_subtitle_ass_content(
    subtitles: &ClipBatchSubtitlePayload,
    context: &ClipSubtitleRenderContext,
) -> Option<String> {
    if !subtitles.enabled || subtitles.words.is_empty() || context.clip_end <= context.clip_start {
        return None;
    }

    let safe_box_width = context.subtitle_box_width.clamp(0.55, 1.65);
    let safe_box_height = context.subtitle_box_height.clamp(0.55, 1.65);
    let max_words_per_line = ((subtitles.render_profile.max_words_per_line as f64 * safe_box_width)
        .round() as u32)
        .clamp(2, 14) as usize;
    let max_chars_per_line = ((subtitles.render_profile.max_chars_per_line as f64 * safe_box_width)
        .round() as u32)
        .clamp(12, 64) as usize;
    let max_lines = ((subtitles.render_profile.max_lines as f64 * safe_box_height).round() as u32)
        .clamp(1, 6) as usize;
    let chunk_word_limit = (max_words_per_line * max_lines).clamp(3, 24);
    let chunk_char_limit = (max_chars_per_line * max_lines).clamp(18, 140);

    let mut words: Vec<ClipSubtitleWord> = subtitles
        .words
        .iter()
        .filter_map(|word| {
            let start = word.start.max(context.clip_start);
            let end = word.end.min(context.clip_end);
            if !start.is_finite() || !end.is_finite() || end <= start + 0.025 {
                return None;
            }
            let normalized =
                normalize_subtitle_word_text(&word.text, subtitles.render_profile.all_caps);
            if normalized.is_empty() {
                return None;
            }
            Some(ClipSubtitleWord {
                emphasis: subtitles.render_profile.highlight_important_words
                    && is_emphasis_candidate(&normalized),
                text: normalized,
                start,
                end,
            })
        })
        .collect();

    if words.is_empty() {
        return None;
    }

    words.sort_by(|left, right| {
        left.start
            .partial_cmp(&right.start)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    let mut chunks: Vec<Vec<ClipSubtitleWord>> = Vec::new();
    let mut current_chunk: Vec<ClipSubtitleWord> = Vec::new();
    let mut current_chars = 0_usize;

    for word in words {
        let additional_chars = if current_chunk.is_empty() {
            word.text.chars().count()
        } else {
            word.text.chars().count() + 1
        };
        let chunk_start = current_chunk
            .first()
            .map(|value| value.start)
            .unwrap_or(word.start);
        let predicted_duration = word.end - chunk_start;
        let chunk_has_overflow = current_chunk.len() >= chunk_word_limit
            || current_chars + additional_chars > chunk_char_limit
            || predicted_duration > 4.4;
        let has_large_gap = current_chunk
            .last()
            .map(|previous| word.start - previous.end > 0.62)
            .unwrap_or(false);
        let ended_sentence = current_chunk
            .last()
            .map(|previous| {
                is_sentence_boundary_token(&previous.text)
                    && current_chunk.len() >= (chunk_word_limit / 2).max(2)
            })
            .unwrap_or(false);

        if !current_chunk.is_empty() && (chunk_has_overflow || has_large_gap || ended_sentence) {
            push_chunk(&mut chunks, &mut current_chunk);
            current_chars = 0;
        }

        current_chars += if current_chunk.is_empty() {
            word.text.chars().count()
        } else {
            word.text.chars().count() + 1
        };
        current_chunk.push(word);
    }
    push_chunk(&mut chunks, &mut current_chunk);

    let base_margin_x = subtitles.render_profile.safe_margin_x.clamp(20, 220) as f64;
    let base_margin_y = subtitles.render_profile.safe_margin_y.clamp(36, 280) as f64;
    let margin_x = (base_margin_x / safe_box_width)
        .round()
        .clamp(8.0, (context.target_w as f64 / 2.0) - 6.0);
    let margin_y = (base_margin_y / safe_box_height)
        .round()
        .clamp(14.0, (context.target_h as f64 / 2.0) - 8.0);
    let margin_x_px = margin_x as u32;
    let margin_y_px = margin_y as u32;
    let safe_subtitle_offset_x = context.subtitle_offset_x.clamp(-1.0, 1.0);
    let safe_subtitle_offset_y = context.subtitle_offset_y.clamp(-1.0, 1.0);
    let mut pos_x =
        context.target_w as f64 / 2.0 + safe_subtitle_offset_x * context.target_w as f64 * 0.36;
    let mut pos_y = match subtitles
        .render_profile
        .position
        .trim()
        .to_lowercase()
        .as_str()
    {
        "top" => margin_y + subtitles.render_profile.font_size as f64 * 0.95,
        "center" => context.target_h as f64 / 2.0,
        _ => context.target_h as f64 - margin_y,
    };
    pos_y += safe_subtitle_offset_y * context.target_h as f64 * 0.76;
    pos_x = pos_x.clamp(margin_x, context.target_w as f64 - margin_x);
    let min_pos_y = margin_y + subtitles.render_profile.font_size as f64 * 0.6;
    let max_pos_y = (context.target_h as f64 - margin_y).max(min_pos_y + 1.0);
    pos_y = pos_y.clamp(min_pos_y, max_pos_y);
    let position_tag = format!("{{\\pos({pos_x:.1},{pos_y:.1})}}");
    let primary_ass_color = ass_color(&subtitles.render_profile.primary_color, "#FFFFFF");
    let secondary_ass_color = ass_color(&subtitles.render_profile.secondary_color, "#7EA6FF");
    let outline_ass_color = ass_color(&subtitles.render_profile.outline_color, "#0A0D16");
    let back_ass_color = ass_back_color(&subtitles.render_profile.shadow_color, "#000000", 0x78);
    let alignment = subtitle_alignment(&subtitles.render_profile.position);
    let bold = if subtitles.render_profile.bold { -1 } else { 0 };
    let italic = if subtitles.render_profile.italic {
        -1
    } else {
        0
    };
    let font_family = subtitles
        .render_profile
        .font_family
        .replace(',', " ")
        .trim()
        .to_string();
    let font_family = if font_family.is_empty() {
        "Montserrat".to_string()
    } else {
        font_family
    };
    let font_size = subtitles.render_profile.font_size.clamp(24, 104);
    let spacing = subtitles.render_profile.letter_spacing.clamp(-1.4, 5.8);
    let outline = subtitles.render_profile.outline_width.clamp(0.0, 7.0);
    let shadow = subtitles.render_profile.shadow_depth.clamp(0.0, 6.0);

    let mut dialogues: Vec<String> = Vec::new();
    let clip_duration = (context.clip_end - context.clip_start).max(0.1);
    for chunk in chunks {
        let lines =
            split_chunk_into_lines(&chunk, max_words_per_line, max_chars_per_line, max_lines);
        if lines.is_empty() {
            continue;
        }
        let start = lines
            .first()
            .and_then(|line| line.first())
            .map(|value| value.start)
            .unwrap_or(context.clip_start);
        let end = lines
            .last()
            .and_then(|line| line.last())
            .map(|value| value.end)
            .unwrap_or(start + 0.2);

        let relative_start = (start - context.clip_start).clamp(0.0, clip_duration);
        let relative_end = (end - context.clip_start + 0.12).clamp(0.0, clip_duration);
        if relative_end <= relative_start + 0.08 {
            continue;
        }

        let text = format!(
            "{position_tag}{}",
            build_subtitle_event_text(&lines, &subtitles.render_profile, &secondary_ass_color)
        );
        dialogues.push(format!(
            "Dialogue: 0,{},{},CCMain,,{margin_x_px},{margin_x_px},{margin_y_px},,{}",
            ass_timestamp(relative_start),
            ass_timestamp(relative_end),
            text
        ));
    }

    if dialogues.is_empty() {
        return None;
    }

    let mut content = format!(
        "[Script Info]\nScriptType: v4.00+\nPlayResX: {target_w}\nPlayResY: {target_h}\nWrapStyle: 2\nScaledBorderAndShadow: yes\nYCbCr Matrix: TV.601\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: CCMain,{font_family},{font_size},{primary_ass_color},{secondary_ass_color},{outline_ass_color},{back_ass_color},{bold},{italic},0,0,100,100,{spacing},0,1,{outline},{shadow},{alignment},{margin_x_px},{margin_x_px},{margin_y_px},1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n",
        target_w = context.target_w,
        target_h = context.target_h,
    );
    for dialogue in dialogues {
        content.push_str(&dialogue);
        content.push('\n');
    }
    Some(content)
}

pub(super) fn write_clip_subtitle_ass_file(
    subtitles: &ClipBatchSubtitlePayload,
    output_path: &Path,
    context: ClipSubtitleRenderContext,
) -> Result<bool, String> {
    let Some(content) = build_clip_subtitle_ass_content(subtitles, &context) else {
        return Ok(false);
    };
    fs::write(output_path, content)
        .map_err(|error| format!("Failed to save ASS subtitle file: {error}"))?;
    Ok(true)
}

#[derive(Debug, Clone, Copy)]
pub(super) struct ExportVideoRenderJob<'a> {
    ffmpeg_binary: &'a Path,
    source_path: &'a Path,
    output_path: &'a Path,
    start: f64,
    end: f64,
    target_w: u32,
    target_h: u32,
    fit_mode: &'a str,
    render_zoom: f64,
    render_offset_x: f64,
    render_offset_y: f64,
    subtitle_ass_path: Option<&'a Path>,
}

pub(super) fn build_export_video_with_ffmpeg(job: ExportVideoRenderJob<'_>) -> Result<(), String> {
    let safe_start = clamp_export_time(job.start);
    let safe_end = clamp_export_time(job.end);
    if safe_end <= safe_start + 0.1 {
        return Err("Export range is too short.".to_string());
    }
    let duration = (safe_end - safe_start).max(0.1);
    let safe_zoom = job.render_zoom.clamp(0.35, 3.0);
    let safe_offset_x = job.render_offset_x.clamp(-1.0, 1.0);
    let safe_offset_y = job.render_offset_y.clamp(-1.0, 1.0);

    let build_filter = |mode: &str| -> String {
        let mut vf = if mode.eq_ignore_ascii_case("cover") {
            format!(
                "scale={target_w}:{target_h}:force_original_aspect_ratio=increase,scale='trunc(iw*{safe_zoom:.5}/2)*2':'trunc(ih*{safe_zoom:.5}/2)*2',pad='max(iw,{target_w})':'max(ih,{target_h})':(ow-iw)/2:(oh-ih)/2:black,crop={target_w}:{target_h}:max(0,min(iw-{target_w},(iw-{target_w})/2+({safe_offset_x:.5})*(iw-{target_w})/2)):max(0,min(ih-{target_h},(ih-{target_h})/2+({safe_offset_y:.5})*(ih-{target_h})/2)),setsar=1",
                target_w = job.target_w,
                target_h = job.target_h
            )
        } else if mode.eq_ignore_ascii_case("cover-center") {
            format!(
                "scale={target_w}:{target_h}:force_original_aspect_ratio=increase,crop={target_w}:{target_h},setsar=1",
                target_w = job.target_w,
                target_h = job.target_h
            )
        } else {
            format!(
                "scale={target_w}:{target_h}:force_original_aspect_ratio=decrease,pad={target_w}:{target_h}:(ow-iw)/2:(oh-ih)/2:black,setsar=1",
                target_w = job.target_w,
                target_h = job.target_h
            )
        };
        if let Some(ass_path) = job.subtitle_ass_path {
            let escaped_sub_path = escape_ffmpeg_filter_path(ass_path);
            vf.push_str(&format!(
                ",subtitles=filename='{escaped_sub_path}':charenc=UTF-8"
            ));
        }
        vf
    };

    let run_with_filter = |vf: &str| -> Result<(), String> {
        let output = hidden_command(job.ffmpeg_binary)
            .arg("-y")
            .arg("-ss")
            .arg(format!("{safe_start:.3}"))
            .arg("-t")
            .arg(format!("{duration:.3}"))
            .arg("-i")
            .arg(job.source_path)
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
            .arg(job.output_path)
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .output()
            .map_err(|error| format!("Failed to start FFmpeg for export: {error}"))?;

        if output.status.success() {
            return Ok(());
        }

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
        Err(message)
    };

    let wants_cover = job.fit_mode.eq_ignore_ascii_case("cover")
        || job.fit_mode.eq_ignore_ascii_case("free")
        || job.fit_mode.eq_ignore_ascii_case("crop");
    if wants_cover {
        let primary_cover_filter = build_filter("cover");
        if let Err(primary_error) = run_with_filter(&primary_cover_filter) {
            let fallback_cover_filter = build_filter("cover-center");
            if let Err(fallback_error) = run_with_filter(&fallback_cover_filter) {
                return Err(format!(
                    "{primary_error} | fallback(cover-center): {fallback_error}"
                ));
            }
        }
        return Ok(());
    }

    let contain_filter = build_filter("contain");
    run_with_filter(&contain_filter)?;

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

pub(super) fn export_clips_batch_sync(
    app: AppHandle,
    request: ClipBatchExportRequest,
) -> Result<ClipBatchExportResult, String> {
    if request.tasks.is_empty() {
        return Err("No export tasks were provided.".to_string());
    }
    if request.tasks.len() > 200 {
        return Err("Too many tasks in one export request.".to_string());
    }
    let has_subtitle_tasks = request
        .tasks
        .iter()
        .any(|task| task.subtitles_enabled.unwrap_or(false));
    if has_subtitle_tasks && request.subtitles.is_none() {
        return Err(
            "Subtitle profile is missing for subtitle-enabled tasks. Check export settings."
                .to_string(),
        );
    }
    if let Some(subtitles) = request.subtitles.as_ref() {
        if subtitles.enabled && subtitles.words.len() > 60_000 {
            return Err(
                "Subtitle word volume is too large. Reduce transcript size or split export into parts."
                    .to_string(),
            );
        }
    }
    let settings = load_settings(&app)?;
    let ffmpeg_binary = resolve_ffmpeg_binary(&app, &settings)
        .map(|(path, _)| path)
        .ok_or_else(|| {
            "FFmpeg was not found. Install it or configure path in Settings.".to_string()
        })?;
    let source_path = validate_export_path(&request.source_path)?;
    let base_export_dir =
        compute_export_base_dir(&app, &settings, request.project_name.clone(), &source_path)?;
    fs::create_dir_all(&base_export_dir)
        .map_err(|error| format!("Failed to create export directory: {error}"))?;
    let run_dir = base_export_dir.join(format!(
        "batch-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|_| "Failed to compute export start time.".to_string())?
            .as_secs()
    ));
    fs::create_dir_all(&run_dir)
        .map_err(|error| format!("Failed to create batch export folder: {error}"))?;

    let task_key = sanitize_optional_path(request.task_id)
        .ok()
        .flatten()
        .unwrap_or_else(|| {
            format!(
                "clip-export:{}",
                sanitize_project_name(Some(request.project_id.clone()))
            )
        });
    emit_install_progress_with_detail(
        &app,
        &task_key,
        "progress",
        "Preparing clip batch export...",
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
                "Invalid clip range {} ({}-{}).",
                task.clip_id, task.start, task.end
            ));
        }
        let fit_mode = task.fit_mode.clone().unwrap_or_else(|| "cover".to_string());
        let render_zoom = task.render_zoom.unwrap_or(1.0);
        let render_offset_x = task.render_offset_x.unwrap_or(0.0);
        let render_offset_y = task.render_offset_y.unwrap_or(0.0);
        let subtitle_offset_x = task.subtitle_offset_x.unwrap_or(0.0).clamp(-1.0, 1.0);
        let subtitle_offset_y = task.subtitle_offset_y.unwrap_or(0.0).clamp(-1.0, 1.0);
        let subtitle_box_width = task.subtitle_box_width.unwrap_or(1.0).clamp(0.55, 1.65);
        let subtitle_box_height = task.subtitle_box_height.unwrap_or(1.0).clamp(0.55, 1.65);
        let (target_w, target_h) = pick_render_resolution_with_override(
            &task.aspect,
            task.output_width,
            task.output_height,
        );

        let base_progress = index as f32 / request.tasks.len() as f32;
        emit_install_progress_with_detail(
            &app,
            &task_key,
            "progress",
            &format!(
                "Export {} / {}: {}",
                index + 1,
                request.tasks.len(),
                safe_title
                    .clone()
                    .unwrap_or_else(|| format!("{} {}", task.clip_id, task.platform_id))
            ),
            Some(task.platform_id.clone()),
            Some(0.05 + base_progress * 0.88),
        );

        let subtitle_ass_path = if let Some(subtitles) = request.subtitles.as_ref() {
            if subtitles.enabled && task.subtitles_enabled.unwrap_or(false) {
                let mut subtitle_payload = subtitles.clone();
                if let Some(position_override) = task.subtitle_position_override.as_ref() {
                    let normalized_position = position_override.trim().to_lowercase();
                    if normalized_position == "top"
                        || normalized_position == "center"
                        || normalized_position == "bottom"
                    {
                        subtitle_payload.render_profile.position = normalized_position;
                    }
                }
                let subtitle_path =
                    ensure_unique_export_file_path(&run_dir, &format!("{clip_stem}-subs"), "ass");
                let has_subtitles = write_clip_subtitle_ass_file(
                    &subtitle_payload,
                    &subtitle_path,
                    ClipSubtitleRenderContext {
                        clip_start: start,
                        clip_end: end,
                        target_w,
                        target_h,
                        subtitle_offset_x,
                        subtitle_offset_y,
                        subtitle_box_width,
                        subtitle_box_height,
                    },
                )?;
                if has_subtitles {
                    Some(subtitle_path)
                } else {
                    None
                }
            } else {
                None
            }
        } else {
            None
        };

        build_export_video_with_ffmpeg(ExportVideoRenderJob {
            ffmpeg_binary: &ffmpeg_binary,
            source_path: &source_path,
            output_path: &output_path,
            start,
            end,
            target_w,
            target_h,
            fit_mode: &fit_mode,
            render_zoom,
            render_offset_x,
            render_offset_y,
            subtitle_ass_path: subtitle_ass_path.as_deref(),
        })?;

        let mut exported_cover: Option<String> = None;
        if let Some(raw_cover_path) = task.cover_path.clone() {
            let trimmed = raw_cover_path.trim();
            if !trimmed.is_empty() {
                let cover_source =
                    PathBuf::from(trimmed.strip_prefix("\\\\?\\").unwrap_or(trimmed));
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
                        format!("Failed to copy cover {}: {error}", cover_source.display())
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
        .map_err(|error| format!("Failed to serialize export manifest: {error}"))?;
    fs::write(&metadata_path, metadata_payload)
        .map_err(|error| format!("Failed to save export manifest: {error}"))?;

    emit_install_progress_with_detail(
        &app,
        &task_key,
        "success",
        "Batch export finished.",
        Some(run_dir.to_string_lossy().to_string()),
        Some(1.0),
    );

    Ok(ClipBatchExportResult {
        project_dir: run_dir.to_string_lossy().to_string(),
        exported_count: artifacts.len() as u32,
        artifacts,
    })
}
