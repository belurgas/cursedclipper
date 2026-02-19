// Mock transcript/semantic/hook generators used to bootstrap editor state.
use super::*;

pub(super) fn is_sentence_boundary(value: &str) -> bool {
    value.ends_with('.') || value.ends_with('!') || value.ends_with('?')
}

pub(super) fn semantic_meta(block_type: &str) -> (&'static str, &'static str, &'static str) {
    match block_type {
        "hook" => (
            "Hook",
            "Strong opening with a promised outcome and an attention trigger.",
            "Attention launch",
        ),
        "story" => (
            "Context",
            "Semantic layer that sustains attention and explains why it matters.",
            "Narrative and context",
        ),
        "proof" => (
            "Proof",
            "Fact, example, or metric that strengthens trust.",
            "Value proof",
        ),
        _ => (
            "Action",
            "Clear call to action and next step for the viewer.",
            "Call to action",
        ),
    }
}

pub(super) fn subtitle_presets() -> Vec<SubtitlePreset> {
    vec![
        SubtitlePreset {
            id: "sub_cinematic".into(),
            name: "Cinematic minimal".into(),
            description: "Soft shadow, high contrast, smooth phrase pacing.".into(),
            style_sample: "This is where the idea becomes clear.".into(),
            render_profile: SubtitleRenderProfile {
                animation: "line".into(),
                position: "bottom".into(),
                font_family: "Cormorant Garamond".into(),
                font_size: 60,
                line_height: 1.12,
                max_words_per_line: 6,
                max_chars_per_line: 34,
                max_lines: 2,
                safe_margin_x: 86,
                safe_margin_y: 142,
                primary_color: "#FFFFFF".into(),
                secondary_color: "#D6E2FF".into(),
                outline_color: "#0A0D16".into(),
                shadow_color: "#000000".into(),
                outline_width: 2.3,
                shadow_depth: 2.4,
                bold: true,
                italic: false,
                all_caps: false,
                letter_spacing: 0.28,
                fade_in_ms: 170,
                fade_out_ms: 200,
                highlight_important_words: true,
            },
        },
        SubtitlePreset {
            id: "sub_punch".into(),
            name: "Accent words".into(),
            description: "Key words are subtly amplified in speech rhythm.".into(),
            style_sample: "One strong hook is enough.".into(),
            render_profile: SubtitleRenderProfile {
                animation: "karaoke".into(),
                position: "bottom".into(),
                font_family: "Manrope".into(),
                font_size: 62,
                line_height: 1.12,
                max_words_per_line: 4,
                max_chars_per_line: 26,
                max_lines: 2,
                safe_margin_x: 86,
                safe_margin_y: 112,
                primary_color: "#FFFFFF".into(),
                secondary_color: "#FFC74A".into(),
                outline_color: "#0A0D16".into(),
                shadow_color: "#000000".into(),
                outline_width: 3.2,
                shadow_depth: 1.6,
                bold: true,
                italic: false,
                all_caps: false,
                letter_spacing: 0.12,
                fade_in_ms: 90,
                fade_out_ms: 120,
                highlight_important_words: true,
            },
        },
        SubtitlePreset {
            id: "sub_editorial".into(),
            name: "Editorial style".into(),
            description: "Premium typography for expert storytelling.".into(),
            style_sample: "Audience remembers emotional clarity.".into(),
            render_profile: SubtitleRenderProfile {
                animation: "word-pop".into(),
                position: "center".into(),
                font_family: "Playfair Display".into(),
                font_size: 56,
                line_height: 1.12,
                max_words_per_line: 6,
                max_chars_per_line: 36,
                max_lines: 3,
                safe_margin_x: 86,
                safe_margin_y: 96,
                primary_color: "#FFFFFF".into(),
                secondary_color: "#9ED0FF".into(),
                outline_color: "#0A0D16".into(),
                shadow_color: "#000000".into(),
                outline_width: 1.8,
                shadow_depth: 1.4,
                bold: false,
                italic: false,
                all_caps: false,
                letter_spacing: 0.38,
                fade_in_ms: 140,
                fade_out_ms: 180,
                highlight_important_words: true,
            },
        },
        SubtitlePreset {
            id: "sub_clean".into(),
            name: "Clean universal".into(),
            description: "Compact style for dense informational content.".into(),
            style_sample: "Turn an insight into a concrete action.".into(),
            render_profile: SubtitleRenderProfile {
                animation: "karaoke".into(),
                position: "bottom".into(),
                font_family: "Inter".into(),
                font_size: 52,
                line_height: 1.12,
                max_words_per_line: 6,
                max_chars_per_line: 30,
                max_lines: 2,
                safe_margin_x: 86,
                safe_margin_y: 118,
                primary_color: "#FFFFFF".into(),
                secondary_color: "#77EEB5".into(),
                outline_color: "#0A0D16".into(),
                shadow_color: "#000000".into(),
                outline_width: 2.4,
                shadow_depth: 1.2,
                bold: true,
                italic: false,
                all_caps: false,
                letter_spacing: 0.06,
                fade_in_ms: 100,
                fade_out_ms: 140,
                highlight_important_words: true,
            },
        },
    ]
}

pub(super) fn platform_presets() -> Vec<PlatformPreset> {
    vec![
        PlatformPreset {
            id: "pf_tiktok".into(),
            name: "TikTok".into(),
            aspect: "9:16".into(),
            max_duration: "60 s".into(),
            description: "Fast hook, subtitle-safe margins, dynamic pace.".into(),
        },
        PlatformPreset {
            id: "pf_shorts".into(),
            name: "Shorts".into(),
            aspect: "9:16".into(),
            max_duration: "60 s".into(),
            description: "Retention-oriented rhythm with a direct final CTA.".into(),
        },
        PlatformPreset {
            id: "pf_reels".into(),
            name: "Reels".into(),
            aspect: "9:16".into(),
            max_duration: "90 s".into(),
            description: "Story-driven pacing with clean lower captions.".into(),
        },
        PlatformPreset {
            id: "pf_telegram".into(),
            name: "Telegram".into(),
            aspect: "16:9".into(),
            max_duration: "120 s".into(),
            description: "More contextual format for channel posts and explainers.".into(),
        },
    ]
}

pub(super) fn make_mock_transcript(duration: f64) -> Vec<TranscriptWord> {
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

pub(super) fn build_semantic_blocks(duration: f64) -> Vec<SemanticBlock> {
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

pub(super) fn build_transcript_blocks(words: &[TranscriptWord]) -> Vec<TranscriptSemanticBlock> {
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

pub(super) fn compute_viral_score(words: &[TranscriptWord]) -> u8 {
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
            text.contains("strong")
                || text.contains("single")
                || text.contains("clear")
                || text.contains("peak")
                || text.contains("best")
                || text.contains("fast")
                || text.contains("hook")
                || text.contains("result")
                || text.contains("attention")
                || text.contains("retain")
        })
        .count();
    let energetic_boost = (energetic_words as f64 / 22.0).min(1.0);

    clamp_u8(
        (58.0 + density * 18.0 + punctuation_boost * 11.0 + energetic_boost * 13.0).round() as i32,
        0,
        100,
    )
}

pub(super) fn build_viral_insights(score: u8) -> Vec<ViralInsight> {
    vec![
        ViralInsight {
            id: "vi_hook_density".into(),
            title: "Hook density is above niche median".into(),
            impact: "High".into(),
            detail: format!(
                "First-seconds profile lands in the top {}% by retention probability.",
                (100 - score).max(8)
            ),
        },
        ViralInsight {
            id: "vi_pacing".into(),
            title: "Phrase cadence supports repeat views".into(),
            impact: "Medium".into(),
            detail: "Sentence transitions are compact; attention-drop risk after second 7 is low."
                .into(),
        },
        ViralInsight {
            id: "vi_clarity".into(),
            title: "Value proposition should be strengthened at the ending".into(),
            impact: "Medium".into(),
            detail:
                "Add an explicit outcome in the last 20% of the clip to increase completion intent."
                    .into(),
        },
    ]
}

pub(super) fn build_hook_candidates(
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
            headline: "One edit changed how people finish this video".into(),
            reasoning: "Transformation framing improves retention in the first 3 seconds.".into(),
            predicted_lift: "+18% retention".into(),
            tone: "Bold".into(),
        },
        HookCandidate {
            id: "hk_2".into(),
            headline: "Before publishing, check this timing mistake".into(),
            reasoning: "Risk framing plus practical value increases open probability.".into(),
            predicted_lift: "+12% opens".into(),
            tone: "Direct".into(),
        },
        HookCandidate {
            id: "hk_3".into(),
            headline: format!("From \"{project_name}\" to a 30-second high-conversion story"),
            reasoning: "Referencing the source improves relevance and trust.".into(),
            predicted_lift: "+16% completion".into(),
            tone: "Data-led".into(),
        },
        HookCandidate {
            id: "hk_4".into(),
            headline: format!("The most replayed moment starts here: {compact_seed}..."),
            reasoning: "Open-loop context creates anticipation and increases interest.".into(),
            predicted_lift: "+14% repeats".into(),
            tone: "Reflective".into(),
        },
    ]
}

pub(super) fn build_content_plan_ideas(
    project_name: &str,
    hooks: &[HookCandidate],
) -> Vec<ContentPlanIdea> {
    vec![
        ContentPlanIdea {
            id: "cp_1".into(),
            title: "Mini-series \"Myth / Reality\"".into(),
            angle: "Each episode resolves one audience objection with proof.".into(),
            channels: vec!["Reels".into(), "Shorts".into(), "TikTok".into()],
            script_outline: "Myth -> 2-second rebuttal -> proof snippet -> one practical takeaway."
                .into(),
        },
        ContentPlanIdea {
            id: "cp_2".into(),
            title: "Founder micro-lessons".into(),
            angle: format!("Transform \"{project_name}\" into five strategic micro-stories."),
            channels: vec!["Shorts".into(), "Telegram".into()],
            script_outline:
                "Situation -> solution -> result -> short reflection reinforcing authority.".into(),
        },
        ContentPlanIdea {
            id: "cp_3".into(),
            title: format!(
                "Hook ladder from \"{}\"",
                hooks
                    .first()
                    .map(|hook| hook.headline.as_str())
                    .unwrap_or("core idea")
            ),
            angle: "Publish three versions of one semantic block with different openings.".into(),
            channels: vec!["TikTok".into(), "Reels".into()],
            script_outline:
                "Version A (curiosity) -> Version B (problem) -> Version C (proof-first).".into(),
        },
    ]
}

pub(super) fn build_series_segments(blocks: &[SemanticBlock], duration: f64) -> Vec<SeriesSegment> {
    let safe_duration = duration.max(60.0);
    blocks
        .iter()
        .take(4)
        .enumerate()
        .map(|(index, block)| {
            let (_, _, theme) = semantic_meta(&block.block_type);
            SeriesSegment {
                id: format!("seg_{index}"),
                title: format!("Episode {}", index + 1),
                start: (block.start - 0.8).max(0.0),
                end: (block.end + 0.8).min(safe_duration),
                theme: theme.to_string(),
                rationale: block.summary.clone(),
            }
        })
        .collect()
}

pub(super) fn build_thumbnail_templates(
    project_name: &str,
    duration: f64,
) -> Vec<ThumbnailTemplate> {
    vec![
        ThumbnailTemplate {
            id: "th_1".into(),
            name: "Silver focus".into(),
            overlay_title: "This moment changes everything".into(),
            overlay_subtitle: project_name.to_string(),
            focus_time: (duration * 0.16).max(2.0),
            palette: ["#dfe6f3".into(), "#78839a".into()],
        },
        ThumbnailTemplate {
            id: "th_2".into(),
            name: "Editorial contrast".into(),
            overlay_title: "Insight in 10 seconds".into(),
            overlay_subtitle: "Retention strategy".into(),
            focus_time: (duration * 0.3).max(4.0),
            palette: ["#edf2fb".into(), "#5f6c86".into()],
        },
        ThumbnailTemplate {
            id: "th_3".into(),
            name: "Confident frame".into(),
            overlay_title: "Do this before publishing".into(),
            overlay_subtitle: "Cursed Clipper intelligence".into(),
            focus_time: (duration * 0.45).max(5.0),
            palette: ["#f4f7ff".into(), "#6f7d96".into()],
        },
    ]
}
