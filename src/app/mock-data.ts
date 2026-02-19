import type { NewsItem, Project, TranscriptWord } from "@/app/types"

const script = `
the model already identified the strongest hooks in this interview and ranked them by emotional clarity and retention potential.
now you can remove pauses, align pacing, and prepare versions for reels, shorts, telegram, and other vertical platforms.
while analysis is running, capture key phrases, mark semantic turning points, and preserve speaker energy peaks.
every word in this panel is time-linked, so clips can be assembled precisely before the final render.
`
  .trim()
  .replace(/\s+/g, " ")

export const initialProjects: Project[] = [
  {
    id: "p_01",
    name: "Founder story - episode 12",
    description: "Narrative assembly about product launch and first sales.",
    updatedAt: "5m ago",
    clips: 8,
    durationSeconds: 1520,
    status: "ready",
  },
  {
    id: "p_02",
    name: "Campaign feedback",
    description: "Audience reactions grouped by key objections.",
    updatedAt: "18m ago",
    clips: 5,
    durationSeconds: 940,
    status: "processing",
  },
  {
    id: "p_03",
    name: "Creator podcast pack",
    description: "Weekly set of vertical clips for Shorts and TikTok.",
    updatedAt: "1h ago",
    clips: 11,
    durationSeconds: 2840,
    status: "ready",
  },
  {
    id: "p_04",
    name: "Webinar highlights",
    description: "Feature segments with CTA and value focus.",
    updatedAt: "2h ago",
    clips: 3,
    durationSeconds: 3210,
    status: "draft",
  },
]

export const newsFeed: NewsItem[] = [
  {
    id: "n_01",
    label: "Market",
    title: "Short-form expert monologues continue to increase completion rates.",
    timestamp: "Today",
    coverEmoji: "📈",
    author: "Cursed Clipper Analytics Team",
    summary: "Why expert monologues are back on top in short-form and how to apply this in clipping.",
    contentMarkdown: `
# 📈 Expert monologues are rising again

Short videos with a **clear expert thesis** outperform noisy entertainment with no structure.

## What changed

- 🧠 Audiences recognize useful content faster.
- ⏱️ 20-40 seconds is enough for one strong argument.
- 📱 Vertical framing increases the "direct message" effect.

## Practical template

1. **Hook**: "In 30 seconds I'll show where you're losing views."
2. **Fact**: one concrete example or metric.
3. **Conclusion**: what viewers should do immediately after watching.

> Core rule: one idea per clip.

## Pre-publish checklist

- [x] First semantic punch within 2 seconds.
- [x] Single CTA at the end.
- [x] Dense pacing with no long pauses.

\`Editing heuristic\`: if a phrase does not reinforce the thesis, cut it.
`.trim(),
  },
  {
    id: "n_02",
    label: "Tip",
    title: "Define key terms before clip generation to improve relevance.",
    timestamp: "Today",
    coverEmoji: "📝",
    author: "Cursed Clipper Editorial",
    summary: "A key-term vocabulary before pipeline start significantly increases clip precision.",
    contentMarkdown: `
# 📝 Key terms: define them before generation

If you define **semantic anchors** in advance, the system picks more relevant segments.

## Minimum set

- Product/topic terms
- Core audience pains
- Offer formulations

## How to write them

Use a short Markdown list:

\`\`\`md
- problem: low completion rate
- trigger: attention drop in first 3 seconds
- offer: ready-made editing template
\`\`\`

## What you get

- 🎯 Fewer generic clips
- ⚡ Faster clip selection
- 📊 Cleaner segment-level analytics
`.trim(),
  },
  {
    id: "n_03",
    label: "Insight",
    title: "Clips in the 22-38s range perform best with a clear opening promise.",
    timestamp: "Yesterday",
    coverEmoji: "💡",
    author: "Growth Lab",
    summary: "The 22-38s range remains the most stable for retention in expert content.",
    contentMarkdown: `
# 💡 22-38 seconds is still the best range

Across tests, this interval provides the best balance of **retention** and **semantic density**.

## Suggested structure

- 0-3s: outcome promise
- 4-24s: core point + mini-proof
- 25-38s: wrap-up + CTA

## When to go longer

- For data-heavy case studies and before/after comparisons
- For dense explanatory formats

If a clip is longer than 40s, check for repetitions in the middle.
`.trim(),
  },
]

export const updatesFeed: NewsItem[] = [
  {
    id: "u_01",
    label: "Release",
    title: "Semantic timeline now accounts for confidence in semantic blocks.",
    timestamp: "Today",
    coverEmoji: "🚀",
    author: "Product Team",
    summary: "Block ranking was updated: the system now better distinguishes strong and weak segments.",
    contentMarkdown: `
# 🚀 Release: semantic block confidence

Timeline ranking now weighs each block not only by position, but also by **semantic signal quality**.

## Improvements

- More accurate strong-hook selection
- Fewer false positives on empty phrases
- More stable export recommendations

## Product-level changes

- High-confidence blocks are visually clearer
- Type distribution is easier to read in Analytics
`.trim(),
  },
  {
    id: "u_02",
    label: "System",
    title: "Cover generator now includes quick templates for TikTok and Shorts.",
    timestamp: "Today",
    coverEmoji: "🎨",
    author: "Design Systems",
    summary: "Quick templates were added to speed up cover preparation for vertical platforms.",
    contentMarkdown: `
# 🎨 Quick cover templates

You can now create covers for **TikTok** and **Shorts** much faster without starting from scratch.

## Included in templates

- Contrast-safe zones
- Base title compositions
- Color pairs for dark and light footage

## Recommendation

Use a short title:

> 3-6 words, one action verb, no overload.
`.trim(),
  },
  {
    id: "u_03",
    label: "Interface",
    title: "New workspace mode reduces visual noise during editing.",
    timestamp: "2 days ago",
    coverEmoji: "🧩",
    author: "UX Team",
    summary: "Workspace structure was simplified: fewer distractions and faster access to key actions.",
    contentMarkdown: `
# 🧩 Interface: less noise, more focus

We rebuilt workspace priorities to make editing feel faster.

## Changes

- Secondary panels are less noisy
- Primary actions moved to top level
- Project status readability improved

## Why this matters

In long sessions, visual noise causes faster fatigue.  
The new structure keeps focus on the current step.
`.trim(),
  },
]

export const createProjectDraft = (
  name: string,
  description: string,
): Project => ({
  id: `p_${Math.random().toString(36).slice(2, 9)}`,
  name,
  description,
  updatedAt: "just now",
  clips: 0,
  durationSeconds: 0,
  status: "draft",
})

export const formatSeconds = (seconds: number): string => {
  const bounded = Math.max(0, Math.floor(seconds))
  const mins = Math.floor(bounded / 60)
  const secs = bounded % 60
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

export const formatDurationLabel = (seconds: number): string => {
  const bounded = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(bounded / 3600)
  const mins = Math.floor((bounded % 3600) / 60)
  const secs = bounded % 60
  if (hours > 0) {
    if (mins > 0) {
      return `${hours}h ${mins}m`
    }
    return `${hours}h ${secs}s`
  }
  if (mins > 0) {
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`
  }
  return `${secs}s`
}

export const makeMockTranscript = (duration: number): TranscriptWord[] => {
  const safeDuration = Math.max(duration, 45)
  const tokens = script.split(" ")
  const desiredWordCount = Math.min(3200, Math.max(220, Math.floor(safeDuration * 2.7)))
  const repeatedTokens = Array.from({ length: desiredWordCount }, (_, index) => {
    return tokens[index % tokens.length]
  })
  const baseStep = safeDuration / (repeatedTokens.length + 6)

  return repeatedTokens.map((text, index) => {
    const drift = (index % 4) * 0.02
    const start = index * baseStep + drift
    const end = Math.min(start + baseStep * 0.92, safeDuration)
    return {
      id: `w_${index}`,
      text,
      start,
      end,
    }
  })
}
