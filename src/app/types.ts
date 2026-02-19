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
  sourceViewCountPrevious?: number
  sourceLikeCount?: number
  sourceLikeCountPrevious?: number
  sourceCommentCount?: number
  sourceCommentCountPrevious?: number
  sourceUploadDate?: string
  sourceChannelId?: string
  sourceChannelUrl?: string
  sourceChannelFollowers?: number
  sourceChannelFollowersPrevious?: number
  sourceMetricsUpdatedAt?: string
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

export type ClipAssemblyTrackType = "video" | "audio"
export type ClipAssemblyItemSourceType = "clip" | "video-file" | "audio-file"

export type ClipAssemblyItem = {
  id: string
  label: string
  sourceType: ClipAssemblyItemSourceType
  sourceClipId: string | null
  sourcePath: string | null
  timelineStart: number
  timelineEnd: number
  sourceIn: number
  sourceOut: number
  volume: number
  opacity: number
  muted: boolean
}

export type ClipAssemblyTrack = {
  id: string
  name: string
  type: ClipAssemblyTrackType
  muted: boolean
  hidden: boolean
  locked: boolean
  items: ClipAssemblyItem[]
}

export type ClipAssemblyState = {
  tracks: ClipAssemblyTrack[]
  activeTrackId: string | null
  activeItemId: string | null
  zoom: number
  subtitleOverlaysEnabled: boolean
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

export type SubtitleAnimationMode = "line" | "karaoke" | "word-pop"
export type SubtitlePosition = "bottom" | "center" | "top"

export type SubtitleRenderProfile = {
  animation: SubtitleAnimationMode
  position: SubtitlePosition
  fontFamily: string
  fontSize: number
  lineHeight: number
  maxWordsPerLine: number
  maxCharsPerLine: number
  maxLines: number
  safeMarginX: number
  safeMarginY: number
  primaryColor: string
  secondaryColor: string
  outlineColor: string
  shadowColor: string
  outlineWidth: number
  shadowDepth: number
  bold: boolean
  italic: boolean
  allCaps: boolean
  letterSpacing: number
  fadeInMs: number
  fadeOutMs: number
  highlightImportantWords: boolean
}

export type SubtitlePreset = {
  id: string
  name: string
  description: string
  styleSample: string
  renderProfile: SubtitleRenderProfile
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

export type ClipCanvasAspect = "9:16" | "16:9" | "1:1"
export type ClipCanvasFitMode = "cover" | "contain"
export type ClipCanvasResolution = `${number}x${number}`

export type ClipCanvasDraft = {
  aspect: ClipCanvasAspect
  resolution: ClipCanvasResolution
  fitMode: ClipCanvasFitMode
  zoom: number
  offsetX: number
  offsetY: number
  subtitlePosition: SubtitlePosition
  subtitleOffsetX: number
  subtitleOffsetY: number
  subtitleBoxWidth: number
  subtitleBoxHeight: number
}

export type ExportClipDraft = {
  title: string
  description: string
  tags: string
  subtitleEnabled?: boolean
  platformIds: string[]
  platformCovers: Record<string, ExportPlatformCoverDraft>
  canvas: ClipCanvasDraft
}
