import type {
  ContentPlanIdea,
  HookCandidate,
  PlatformPreset,
  SemanticBlock,
  SemanticBlockType,
  SeriesSegment,
  SubtitlePreset,
  SubtitleRenderProfile,
  ThumbnailTemplate,
  TranscriptSemanticBlock,
  TranscriptWord,
  ViralInsight,
} from "@/app/types"

const semanticPalette: Record<
  SemanticBlockType,
  { bg: string; border: string; glow: string }
> = {
  hook: { bg: "rgba(181, 196, 220, 0.18)", border: "rgba(204, 217, 240, 0.5)", glow: "#d7deed" },
  story: { bg: "rgba(136, 156, 187, 0.18)", border: "rgba(150, 172, 206, 0.48)", glow: "#b3c3e2" },
  proof: { bg: "rgba(124, 134, 153, 0.2)", border: "rgba(153, 167, 194, 0.42)", glow: "#a8b4cc" },
  cta: { bg: "rgba(188, 198, 216, 0.2)", border: "rgba(220, 228, 242, 0.5)", glow: "#dae3f3" },
}

const semanticMeta: Record<SemanticBlockType, { label: string; summary: string; theme: string }> =
  {
    hook: {
      label: "Hook",
      summary: "Strong opening with a clear outcome promise and attention trigger.",
      theme: "Attention ignition",
    },
    story: {
      label: "Context",
      summary: "Narrative layer that holds attention and explains the reason.",
      theme: "Narrative and context",
    },
    proof: {
      label: "Proof",
      summary: "Fact, example, or metric that reinforces trust.",
      theme: "Value validation",
    },
    cta: {
      label: "Action",
      summary: "Clear call to action and next step for the viewer.",
      theme: "Call to action",
    },
  }

const blockTypeCycle: SemanticBlockType[] = ["hook", "story", "proof", "cta"]

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const isSentenceBoundary = (value: string) => /[.!?]$/.test(value)

const defaultSubtitleRenderProfile: SubtitleRenderProfile = {
  animation: "line",
  position: "bottom",
  fontFamily: "Montserrat",
  fontSize: 58,
  lineHeight: 1.12,
  maxWordsPerLine: 5,
  maxCharsPerLine: 28,
  maxLines: 2,
  safeMarginX: 86,
  safeMarginY: 124,
  primaryColor: "#FFFFFF",
  secondaryColor: "#7EA6FF",
  outlineColor: "#0A0D16",
  shadowColor: "#000000",
  outlineWidth: 2.8,
  shadowDepth: 1.8,
  bold: true,
  italic: false,
  allCaps: false,
  letterSpacing: 0.2,
  fadeInMs: 110,
  fadeOutMs: 150,
  highlightImportantWords: true,
}

const makeRenderProfile = (
  overrides: Partial<SubtitleRenderProfile>,
): SubtitleRenderProfile => ({
  ...defaultSubtitleRenderProfile,
  ...overrides,
})

export const subtitlePresets: SubtitlePreset[] = [
  {
    id: "sub_cinematic",
    name: "Cinematic minimal",
    description: "Soft shadow, high contrast, smooth phrase flow.",
    styleSample: "This is where the idea becomes clear.",
    renderProfile: makeRenderProfile({
      animation: "line",
      fontFamily: "Cormorant Garamond",
      fontSize: 60,
      maxWordsPerLine: 6,
      maxCharsPerLine: 34,
      outlineWidth: 2.3,
      shadowDepth: 2.4,
      letterSpacing: 0.28,
      fadeInMs: 170,
      fadeOutMs: 200,
      secondaryColor: "#D6E2FF",
      safeMarginY: 142,
    }),
  },
  {
    id: "sub_punch",
    name: "Accent words",
    description: "Key words are subtly enhanced in speech rhythm.",
    styleSample: "One strong hook is enough.",
    renderProfile: makeRenderProfile({
      animation: "karaoke",
      fontFamily: "Manrope",
      fontSize: 62,
      maxWordsPerLine: 4,
      maxCharsPerLine: 26,
      secondaryColor: "#FFC74A",
      outlineWidth: 3.2,
      shadowDepth: 1.6,
      letterSpacing: 0.12,
      fadeInMs: 90,
      fadeOutMs: 120,
      bold: true,
      safeMarginY: 112,
    }),
  },
  {
    id: "sub_editorial",
    name: "Editorial style",
    description: "Premium typography for expert storytelling.",
    styleSample: "Audience remembers emotional clarity.",
    renderProfile: makeRenderProfile({
      animation: "word-pop",
      position: "center",
      fontFamily: "Playfair Display",
      fontSize: 56,
      maxWordsPerLine: 6,
      maxCharsPerLine: 36,
      maxLines: 3,
      outlineWidth: 1.8,
      shadowDepth: 1.4,
      bold: false,
      italic: false,
      allCaps: false,
      letterSpacing: 0.38,
      secondaryColor: "#9ED0FF",
      safeMarginY: 96,
    }),
  },
  {
    id: "sub_clean",
    name: "Clean universal",
    description: "Compact style for dense informational content.",
    styleSample: "Turn insight into concrete action.",
    renderProfile: makeRenderProfile({
      animation: "karaoke",
      fontFamily: "Inter",
      fontSize: 52,
      maxWordsPerLine: 6,
      maxCharsPerLine: 30,
      maxLines: 2,
      outlineWidth: 2.4,
      shadowDepth: 1.2,
      bold: true,
      letterSpacing: 0.06,
      safeMarginY: 118,
      secondaryColor: "#77EEB5",
    }),
  },
]

export const platformPresets: PlatformPreset[] = [
  {
    id: "pf_tiktok",
    name: "TikTok",
    aspect: "9:16",
    maxDuration: "60s",
    description: "Fast hook, subtitle-safe zones, dynamic pacing.",
  },
  {
    id: "pf_shorts",
    name: "Shorts",
    aspect: "9:16",
    maxDuration: "60s",
    description: "Retention-focused pacing with direct CTA at the end.",
  },
  {
    id: "pf_reels",
    name: "Reels",
    aspect: "9:16",
    maxDuration: "90s",
    description: "Story-driven delivery with clean lower subtitles.",
  },
  {
    id: "pf_telegram",
    name: "Telegram",
    aspect: "16:9",
    maxDuration: "120s",
    description: "Context-rich format for channel posts and explainers.",
  },
]

export const getSemanticStyle = (type: SemanticBlockType) => semanticPalette[type]

export const buildSemanticBlocks = (duration: number): SemanticBlock[] => {
  const safeDuration = Math.max(duration, 60)
  const blockCount = clamp(Math.round(safeDuration / 36), 4, 9)
  const blockSize = safeDuration / blockCount

  return Array.from({ length: blockCount }, (_, index) => {
    const type = blockTypeCycle[index % blockTypeCycle.length]
    const start = index * blockSize
    const end = Math.min(start + blockSize, safeDuration)
    const confidence = clamp(Math.round(89 - ((index % 4) * 4 + index * 0.8)), 72, 92)

    return {
      id: `sb_${index}`,
      label: `${semanticMeta[type].label} ${index + 1}`,
      start,
      end,
      type,
      confidence,
      summary: semanticMeta[type].summary,
    }
  })
}

export const buildTranscriptSemanticBlocks = (
  words: TranscriptWord[],
): TranscriptSemanticBlock[] => {
  if (words.length === 0) {
    return []
  }

  const blocks: TranscriptSemanticBlock[] = []
  let wordStart = 0

  for (let index = 0; index < words.length; index += 1) {
    const size = index - wordStart + 1
    const naturalBoundary = isSentenceBoundary(words[index].text) && size >= 8
    const hardBoundary = size >= 22
    const isLast = index === words.length - 1

    if (!naturalBoundary && !hardBoundary && !isLast) {
      continue
    }

    const type = blockTypeCycle[blocks.length % blockTypeCycle.length]
    const confidence = clamp(Math.round(91 - (blocks.length % 5) * 3), 73, 94)
    const block: TranscriptSemanticBlock = {
      id: `tsb_${blocks.length}`,
      label: `${semanticMeta[type].label} ${blocks.length + 1}`,
      start: words[wordStart]?.start ?? 0,
      end: words[index]?.end ?? words[wordStart]?.end ?? 0,
      type,
      confidence,
      summary: semanticMeta[type].summary,
      wordStart,
      wordEnd: index,
    }
    blocks.push(block)
    wordStart = index + 1
  }

  if (blocks.length < 2) {
    return blocks
  }

  const merged: TranscriptSemanticBlock[] = []
  for (const block of blocks) {
    const previous = merged[merged.length - 1]
    const blockDuration = block.end - block.start
    const canMergeWithPrevious = previous && blockDuration < 1.2
    if (!canMergeWithPrevious) {
      merged.push(block)
      continue
    }

    previous.end = block.end
    previous.wordEnd = block.wordEnd
    previous.confidence = Math.round((previous.confidence + block.confidence) / 2)
  }

  return merged.map((block, index) => ({
    ...block,
    id: `tsb_${index}`,
    label: `${semanticMeta[block.type].label} ${index + 1}`,
  }))
}

export const computeViralScore = (words: TranscriptWord[]): number => {
  if (words.length === 0) {
    return 0
  }

  const density = Math.min(1, words.length / 120)
  const punctuationBoost = words.filter((word) => /[.!?]$/.test(word.text)).length / words.length
  const energeticWords = words.filter((word) =>
    /(strong|clear|peak|better|fast|hook|result|focus|retain|watch)/i.test(word.text),
  ).length
  const energeticBoost = Math.min(1, energeticWords / 22)

  return Math.round(58 + density * 18 + punctuationBoost * 11 + energeticBoost * 13)
}

export const buildViralInsights = (score: number): ViralInsight[] => [
  {
    id: "vi_hook_density",
    title: "Hook density above niche median",
    impact: "High",
    detail: `First-seconds profile falls into top ${Math.max(
      8,
      100 - score,
    )}% for retention probability.`,
  },
  {
    id: "vi_pacing",
    title: "Phrase pacing supports rewatches",
    impact: "Medium",
    detail: "Sentence transitions are compact; attention-drop risk after second 7 is low.",
  },
  {
    id: "vi_clarity",
    title: "Value statement should be stronger in the ending",
    impact: "Medium",
    detail: "Add an explicit outcome in the final 20% of the clip to increase completion intent.",
  },
]

export const buildHookCandidates = (
  projectName: string,
  sourceWords: TranscriptWord[],
): HookCandidate[] => {
  const seedPhrase = sourceWords.slice(0, 12).map((word) => word.text).join(" ")
  const compactSeed = seedPhrase.slice(0, 64).trim()

  return [
    {
      id: "hk_1",
      headline: "One edit changed how people complete this video",
      reasoning: "Transformation framing increases retention in the first 3 seconds.",
      predictedLift: "+18% retention",
      tone: "Bold",
    },
    {
      id: "hk_2",
      headline: "Before publishing a clip, check this timing mistake",
      reasoning: "Risk framing plus practical benefit increases open probability.",
      predictedLift: "+12% opens",
      tone: "Direct",
    },
    {
      id: "hk_3",
      headline: `From "${projectName}" to a 30-second high-conversion story`,
      reasoning: "Mentioning source increases relevance and trust.",
      predictedLift: "+16% completion",
      tone: "Data-led",
    },
    {
      id: "hk_4",
      headline: `The most rewatched moment starts here: ${compactSeed}...`,
      reasoning: "Unfinished context creates anticipation and boosts interest.",
      predictedLift: "+14% rewatches",
      tone: "Reflective",
    },
  ]
}

export const buildContentPlanIdeas = (
  projectName: string,
  hooks: HookCandidate[],
): ContentPlanIdea[] => [
  {
    id: "cp_1",
    title: "Mini-series: Myth / Reality",
    angle: "Each episode closes one audience objection with proof.",
    channels: ["Reels", "Shorts", "TikTok"],
    scriptOutline:
      "Myth -> 2-second rebuttal -> proof fragment -> one practical conclusion.",
  },
  {
    id: "cp_2",
    title: "Founder micro-lessons",
    angle: `Turn "${projectName}" into five strategic micro-stories.`,
    channels: ["Shorts", "Telegram"],
    scriptOutline:
      "Situation -> solution -> result -> short reflection reinforcing authority.",
  },
  {
    id: "cp_3",
    title: `Hook ladder from "${hooks[0]?.headline ?? "core idea"}"`,
    angle: "Publish three versions of one semantic block with different openings.",
    channels: ["TikTok", "Reels"],
    scriptOutline:
      "Version A (curiosity) -> Version B (problem) -> Version C (proof first).",
  },
]

export const buildSeriesSegments = (
  blocks: SemanticBlock[],
  duration: number,
): SeriesSegment[] => {
  const safeDuration = Math.max(duration, 60)
  const segments = blocks.slice(0, 4)
  if (segments.length === 0) {
    return []
  }

  return segments.map((block, index) => {
    const paddedStart = Math.max(0, block.start - 0.8)
    const paddedEnd = Math.min(safeDuration, block.end + 0.8)
    return {
      id: `seg_${index}`,
      title: `Episode ${index + 1}`,
      start: paddedStart,
      end: paddedEnd,
      theme: semanticMeta[block.type].theme,
      rationale: block.summary,
    }
  })
}

export const buildThumbnailTemplates = (
  projectName: string,
  duration: number,
): ThumbnailTemplate[] => [
  {
    id: "th_1",
    name: "Silver focus",
    overlayTitle: "This moment changes everything",
    overlaySubtitle: projectName,
    focusTime: Math.max(2, duration * 0.16),
    palette: ["#dfe6f3", "#78839a"],
  },
  {
    id: "th_2",
    name: "Editorial contrast",
    overlayTitle: "Insight in 10 seconds",
    overlaySubtitle: "Retention strategy",
    focusTime: Math.max(4, duration * 0.3),
    palette: ["#edf2fb", "#5f6c86"],
  },
  {
    id: "th_3",
    name: "Confident frame",
    overlayTitle: "Do this before publishing",
    overlaySubtitle: "Cursed Clipper intelligence",
    focusTime: Math.max(5, duration * 0.45),
    palette: ["#f4f7ff", "#6f7d96"],
  },
]
