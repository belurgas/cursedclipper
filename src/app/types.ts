export type ProjectStatus = "ready" | "processing" | "draft"
export type ProjectSourceType = "local" | "youtube"
export type ProjectSourceStatus = "pending" | "ready" | "failed"

export type Project = {
  id: string
  name: string
  description: string
  updatedAt: string
  clips: number
  durationSeconds: number
  status: ProjectStatus
  sourceType?: ProjectSourceType
  sourceLabel?: string
  sourceUrl?: string
  sourceStatus?: ProjectSourceStatus
  sourceUploader?: string
  sourceDurationSeconds?: number
  sourceThumbnail?: string
  sourceViewCount?: number
  sourceLikeCount?: number
  sourceCommentCount?: number
  sourceUploadDate?: string
  sourceChannelId?: string
  sourceChannelUrl?: string
  sourceChannelFollowers?: number
  importedMediaPath?: string
}

export type NewsItem = {
  id: string
  label: string
  title: string
  timestamp: string
  summary?: string
  author?: string
  coverEmoji?: string
  contentMarkdown?: string
}

export type TranscriptWord = {
  id: string
  text: string
  start: number
  end: number
}

export type WordRange = {
  start: number
  end: number
}

export type ClipSegment = {
  id: string
  title: string
  start: number
  end: number
  projectId: string
}

export type SemanticBlockType = "hook" | "story" | "proof" | "cta"

export type SemanticBlock = {
  id: string
  label: string
  start: number
  end: number
  type: SemanticBlockType
  confidence: number
  summary: string
}

export type TranscriptSemanticBlock = SemanticBlock & {
  wordStart: number
  wordEnd: number
}

export type ViralInsight = {
  id: string
  title: string
  impact: "High" | "Medium" | "Low"
  detail: string
}

export type HookCandidate = {
  id: string
  headline: string
  reasoning: string
  predictedLift: string
  tone: "Bold" | "Direct" | "Reflective" | "Data-led"
}

export type SubtitlePreset = {
  id: string
  name: string
  description: string
  styleSample: string
}

export type PlatformPreset = {
  id: string
  name: "TikTok" | "Shorts" | "Reels" | "Telegram"
  aspect: string
  maxDuration: string
  description: string
}

export type ContentPlanIdea = {
  id: string
  title: string
  angle: string
  channels: string[]
  scriptOutline: string
}

export type SeriesSegment = {
  id: string
  title: string
  start: number
  end: number
  theme: string
  rationale: string
}

export type ThumbnailTemplate = {
  id: string
  name: string
  overlayTitle: string
  overlaySubtitle: string
  focusTime: number
  palette: [string, string]
}

export type ExportPlatformCoverMode = "generated" | "custom"

export type ExportPlatformCoverDraft = {
  coverMode: ExportPlatformCoverMode
  templateId: string | null
  customCoverPath: string | null
  customCoverName: string | null
}

export type ExportClipDraft = {
  title: string
  description: string
  tags: string
  platformIds: string[]
  platformCovers: Record<string, ExportPlatformCoverDraft>
}
