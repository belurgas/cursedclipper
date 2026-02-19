import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { convertFileSrc } from "@tauri-apps/api/core"

import type {
  ClipAssemblyItem,
  ClipAssemblyState,
  ClipAssemblyTrack,
  ClipAssemblyTrackType,
  ClipSegment,
  ContentPlanIdea,
  ExportClipDraft,
  HookCandidate,
  PlatformPreset,
  SemanticBlock,
  SeriesSegment,
  SubtitleRenderProfile,
  SubtitlePreset,
  ThumbnailTemplate,
  TranscriptSemanticBlock,
  TranscriptWord,
  ViralInsight,
  WordRange,
} from "@/app/types"
import {
  platformPresets,
  subtitlePresets,
} from "@/features/workspace/mock-ai"
import {
  createTimelineHistory,
  redoTimelineHistory,
  replaceTimelineSnapshot,
  type TimelineSnapshot,
  undoTimelineHistory,
  updateTimelineHistory,
} from "@/features/workspace/timeline-engine"
import {
  type WorkspacePersistedState,
  type WorkspaceMockPayload,
  generateWorkspaceMockViaBackend,
  regenerateHooksViaBackend,
  regenerateThumbnailsViaBackend,
} from "@/shared/tauri/backend"
import { isTauriRuntime } from "@/shared/tauri/runtime"

export type TimelineRange = {
  start: number
  end: number
}

type VideoAnalysisMetric = {
  id: string
  label: string
  value: string
  detail: string
}

type VideoAnalysisReport = {
  generatedAtUnix: number
  summary: string
  highlights: string[]
  recommendations: string[]
  metrics: VideoAnalysisMetric[]
}

const defaultPlatformSelection = ["pf_tiktok", "pf_shorts"]

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))
const MIN_CLIP_DURATION_SECONDS = 0.35
const MAX_TIMELINE_DURATION_SECONDS = 10 * 60 * 60
const MIN_ASSEMBLY_ITEM_DURATION_SECONDS = 0.2
const MIN_ASSEMBLY_ZOOM = 0.03
const MAX_ASSEMBLY_ZOOM = 6

const formatDurationCompact = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const remainingSeconds = safeSeconds % 60
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`
  }
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`
}

const inferAspectLabel = (width: number, height: number): "9:16" | "16:9" | "1:1" => {
  if (width <= 0 || height <= 0) {
    return "16:9"
  }
  const ratio = width / height
  if (Math.abs(ratio - 1) <= 0.08) {
    return "1:1"
  }
  return ratio < 1 ? "9:16" : "16:9"
}

const buildMockVideoAnalysis = (params: {
  projectName: string
  videoName: string
  duration: number
  width: number
  height: number
}): VideoAnalysisReport => {
  const safeDuration = Math.max(1, params.duration)
  const aspect = inferAspectLabel(params.width, params.height)
  const pacing =
    safeDuration < 45 ? "Very dense" : safeDuration < 140 ? "Balanced" : "Steady"
  const avgSceneBeatSeconds = safeDuration < 60 ? 1.9 : safeDuration < 160 ? 2.8 : 3.7
  const introWindow = Math.min(6, Math.max(2, Math.round(safeDuration * 0.08)))
  const focusWindow = Math.min(28, Math.max(8, Math.round(safeDuration * 0.23)))
  const outroWindowStart = Math.max(0, safeDuration - Math.min(14, Math.round(safeDuration * 0.12)))
  const resolutionLabel =
    params.width > 0 && params.height > 0
      ? `${params.width}x${params.height}`
      : "Unknown"

  return {
    generatedAtUnix: Date.now(),
    summary: `Mock analysis for "${params.projectName}" based on duration, frame format, and speech structure.`,
    highlights: [
      `Keep the first hook within the first ${introWindow}s.`,
      `Optimal core segment: ${focusWindow}s with clear value/proof focus.`,
      `Best CTA start point: around ${formatDurationCompact(outroWindowStart)}.`,
    ],
    recommendations: [
      aspect === "9:16"
        ? "Vertical composition is suitable for Shorts/Reels; keep the subject near center."
        : "Horizontal composition needs a clear focal point in the first seconds.",
      "Before trimming, ensure pauses longer than 0.6s do not sit in the middle of a hook.",
      "After transcription, check subtitle wraps in narrow scenes.",
    ],
    metrics: [
      {
        id: "duration",
        label: "Duration",
        value: formatDurationCompact(safeDuration),
        detail: safeDuration < 90 ? "Suitable for dense clipping." : "Suitable for a clip series.",
      },
      {
        id: "frame",
        label: "Frame",
        value: `${resolutionLabel} · ${aspect}`,
        detail: params.width > 0 && params.height > 0 ? "Taken from file metadata." : "Waiting for metadata read.",
      },
      {
        id: "pacing",
        label: "Pacing",
        value: pacing,
        detail: `Target scene-change cadence: ~${avgSceneBeatSeconds.toFixed(1)}s.`,
      },
      {
        id: "source",
        label: "Source",
        value: params.videoName,
        detail: "Used as base for clipping and export.",
      },
    ],
  }
}

const normalizeVideoAnalysisReport = (value: unknown): VideoAnalysisReport | null => {
  if (!value || typeof value !== "object") {
    return null
  }
  const report = value as Partial<VideoAnalysisReport>
  if (
    typeof report.summary !== "string" ||
    !Array.isArray(report.highlights) ||
    !Array.isArray(report.recommendations) ||
    !Array.isArray(report.metrics)
  ) {
    return null
  }
  const metrics = report.metrics
    .map((metric) => {
      if (!metric || typeof metric !== "object") {
        return null
      }
      const rawMetric = metric as Partial<VideoAnalysisMetric>
      if (
        typeof rawMetric.id !== "string" ||
        typeof rawMetric.label !== "string" ||
        typeof rawMetric.value !== "string" ||
        typeof rawMetric.detail !== "string"
      ) {
        return null
      }
      return {
        id: rawMetric.id,
        label: rawMetric.label,
        value: rawMetric.value,
        detail: rawMetric.detail,
      }
    })
    .filter((metric): metric is VideoAnalysisMetric => Boolean(metric))
  if (metrics.length === 0) {
    return null
  }
  return {
    generatedAtUnix:
      typeof report.generatedAtUnix === "number" && Number.isFinite(report.generatedAtUnix)
        ? Math.round(report.generatedAtUnix)
        : Date.now(),
    summary: report.summary,
    highlights: report.highlights.filter((item): item is string => typeof item === "string"),
    recommendations: report.recommendations.filter((item): item is string => typeof item === "string"),
    metrics,
  }
}

const sortClipsForTimeline = (clips: ClipSegment[]): ClipSegment[] =>
  [...clips].sort((left, right) => {
    if (Math.abs(left.start - right.start) > 0.0001) {
      return left.start - right.start
    }
    if (Math.abs(left.end - right.end) > 0.0001) {
      return left.end - right.end
    }
    return left.id.localeCompare(right.id)
  })

const resolveClipNeighbors = (clips: ClipSegment[], clipId: string) => {
  const ordered = sortClipsForTimeline(clips)
  const index = ordered.findIndex((clip) => clip.id === clipId)
  const target = index >= 0 ? ordered[index] : null
  const previous = index > 0 ? ordered[index - 1] : null
  const next = index >= 0 && index < ordered.length - 1 ? ordered[index + 1] : null
  return {
    ordered,
    index,
    target,
    previous,
    next,
  }
}

const normalizeTimelineSnapshotToDuration = (
  snapshot: TimelineSnapshot,
  duration: number,
): TimelineSnapshot => {
  const timelineEnd = Math.max(duration, MIN_CLIP_DURATION_SECONDS)
  let changed = false
  const nextClips = snapshot.clips.map((clip) => {
    const rawLength = Math.max(MIN_CLIP_DURATION_SECONDS, clip.end - clip.start)
    const nextLength = Math.min(rawLength, timelineEnd)
    const nextStart = clamp(clip.start, 0, Math.max(0, timelineEnd - nextLength))
    const nextEnd = clamp(
      nextStart + nextLength,
      nextStart + MIN_CLIP_DURATION_SECONDS,
      timelineEnd,
    )
    if (Math.abs(nextStart - clip.start) > 0.0001 || Math.abs(nextEnd - clip.end) > 0.0001) {
      changed = true
      return {
        ...clip,
        start: nextStart,
        end: nextEnd,
      }
    }
    return clip
  })

  if (!changed) {
    return snapshot
  }
  return {
    ...snapshot,
    clips: nextClips,
  }
}

const hasValidSubtitleRenderProfile = (value: unknown): boolean => {
  if (!value || typeof value !== "object") {
    return false
  }
  const profile = value as {
    fontFamily?: unknown
    fontSize?: unknown
    maxWordsPerLine?: unknown
    maxCharsPerLine?: unknown
  }
  return (
    typeof profile.fontFamily === "string" &&
    Number.isFinite(profile.fontSize) &&
    Number.isFinite(profile.maxWordsPerLine) &&
    Number.isFinite(profile.maxCharsPerLine)
  )
}

const normalizeSubtitlePresetCollection = (value: unknown): SubtitlePreset[] => {
  if (!Array.isArray(value) || value.length === 0) {
    return subtitlePresets
  }
  const fallbackById = new Map(subtitlePresets.map((preset) => [preset.id, preset]))
  const normalized = value
    .map((candidate) => {
      if (!candidate || typeof candidate !== "object") {
        return null
      }
      const raw = candidate as Partial<SubtitlePreset>
      if (hasValidSubtitleRenderProfile(raw.renderProfile)) {
        return raw as SubtitlePreset
      }
      if (raw.id && fallbackById.has(raw.id)) {
        return fallbackById.get(raw.id) ?? null
      }
      return null
    })
    .filter((preset): preset is SubtitlePreset => Boolean(preset))

  return normalized.length > 0 ? normalized : subtitlePresets
}

const applySubtitleRenderProfilePatch = (
  profile: SubtitleRenderProfile,
  patch: Partial<SubtitleRenderProfile>,
): SubtitleRenderProfile => ({
  ...profile,
  animation:
    patch.animation === "line" || patch.animation === "karaoke" || patch.animation === "word-pop"
      ? patch.animation
      : profile.animation,
  position:
    patch.position === "top" || patch.position === "center" || patch.position === "bottom"
      ? patch.position
      : profile.position,
  fontFamily:
    typeof patch.fontFamily === "string" && patch.fontFamily.trim()
      ? patch.fontFamily.trim()
      : profile.fontFamily,
  fontSize:
    typeof patch.fontSize === "number" && Number.isFinite(patch.fontSize)
      ? Math.round(clamp(patch.fontSize, 24, 104))
      : profile.fontSize,
  lineHeight:
    typeof patch.lineHeight === "number" && Number.isFinite(patch.lineHeight)
      ? clamp(patch.lineHeight, 0.9, 1.8)
      : profile.lineHeight,
  maxWordsPerLine:
    typeof patch.maxWordsPerLine === "number" && Number.isFinite(patch.maxWordsPerLine)
      ? Math.round(clamp(patch.maxWordsPerLine, 2, 14))
      : profile.maxWordsPerLine,
  maxCharsPerLine:
    typeof patch.maxCharsPerLine === "number" && Number.isFinite(patch.maxCharsPerLine)
      ? Math.round(clamp(patch.maxCharsPerLine, 12, 64))
      : profile.maxCharsPerLine,
  maxLines:
    typeof patch.maxLines === "number" && Number.isFinite(patch.maxLines)
      ? Math.round(clamp(patch.maxLines, 1, 6))
      : profile.maxLines,
  safeMarginX:
    typeof patch.safeMarginX === "number" && Number.isFinite(patch.safeMarginX)
      ? Math.round(clamp(patch.safeMarginX, 20, 220))
      : profile.safeMarginX,
  safeMarginY:
    typeof patch.safeMarginY === "number" && Number.isFinite(patch.safeMarginY)
      ? Math.round(clamp(patch.safeMarginY, 36, 280))
      : profile.safeMarginY,
  primaryColor:
    typeof patch.primaryColor === "string" && patch.primaryColor.trim()
      ? patch.primaryColor
      : profile.primaryColor,
  secondaryColor:
    typeof patch.secondaryColor === "string" && patch.secondaryColor.trim()
      ? patch.secondaryColor
      : profile.secondaryColor,
  outlineColor:
    typeof patch.outlineColor === "string" && patch.outlineColor.trim()
      ? patch.outlineColor
      : profile.outlineColor,
  shadowColor:
    typeof patch.shadowColor === "string" && patch.shadowColor.trim()
      ? patch.shadowColor
      : profile.shadowColor,
  outlineWidth:
    typeof patch.outlineWidth === "number" && Number.isFinite(patch.outlineWidth)
      ? clamp(patch.outlineWidth, 0, 7)
      : profile.outlineWidth,
  shadowDepth:
    typeof patch.shadowDepth === "number" && Number.isFinite(patch.shadowDepth)
      ? clamp(patch.shadowDepth, 0, 6)
      : profile.shadowDepth,
  bold: typeof patch.bold === "boolean" ? patch.bold : profile.bold,
  italic: typeof patch.italic === "boolean" ? patch.italic : profile.italic,
  allCaps: typeof patch.allCaps === "boolean" ? patch.allCaps : profile.allCaps,
  letterSpacing:
    typeof patch.letterSpacing === "number" && Number.isFinite(patch.letterSpacing)
      ? clamp(patch.letterSpacing, -1.4, 5.8)
      : profile.letterSpacing,
  fadeInMs:
    typeof patch.fadeInMs === "number" && Number.isFinite(patch.fadeInMs)
      ? Math.round(clamp(patch.fadeInMs, 0, 900))
      : profile.fadeInMs,
  fadeOutMs:
    typeof patch.fadeOutMs === "number" && Number.isFinite(patch.fadeOutMs)
      ? Math.round(clamp(patch.fadeOutMs, 0, 900))
      : profile.fadeOutMs,
  highlightImportantWords:
    typeof patch.highlightImportantWords === "boolean"
      ? patch.highlightImportantWords
      : profile.highlightImportantWords,
})

const findWordIndexByTime = (
  sourceWords: TranscriptWord[],
  visibleCount: number,
  time: number,
) => {
  const upperBound = Math.min(visibleCount, sourceWords.length)
  if (upperBound <= 0) {
    return -1
  }

  let left = 0
  let right = upperBound - 1
  while (left <= right) {
    const middle = (left + right) >> 1
    const word = sourceWords[middle]
    if (!word) {
      return -1
    }
    if (time < word.start) {
      right = middle - 1
      continue
    }
    if (time > word.end) {
      left = middle + 1
      continue
    }
    return middle
  }

  if (left <= 0) {
    return 0
  }
  if (left >= upperBound) {
    return upperBound - 1
  }
  return left - 1
}

export function useWorkspaceController(projectId: string, projectName: string) {
  const streamIntervalRef = useRef<number | null>(null)
  const videoAnalysisTimerRef = useRef<number | null>(null)
  const currentTimeRafRef = useRef<number | null>(null)
  const pendingCurrentTimeRef = useRef<number | null>(null)
  const selectionAnchorRef = useRef<number | null>(null)
  const transcriptionRequestRef = useRef(0)
  const videoAnalysisRequestRef = useRef(0)
  const objectUrlRef = useRef<string | null>(null)
  const scheduledTimersRef = useRef<number[]>([])
  const pipelineStartedRef = useRef(false)
  const pendingPipelinePayloadRef = useRef<WorkspaceMockPayload | null>(null)
  const visibleWordCountRef = useRef(0)

  const [videoName, setVideoName] = useState("")
  const [videoUrl, setVideoUrl] = useState("")
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [videoWidth, setVideoWidth] = useState(0)
  const [videoHeight, setVideoHeight] = useState(0)

  const [words, setWords] = useState<TranscriptWord[]>([])
  const [visibleWordCount, setVisibleWordCount] = useState(0)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [transcriptBlocks, setTranscriptBlocks] = useState<TranscriptSemanticBlock[]>([])

  const [selection, setSelection] = useState<WordRange | null>(null)
  const [manualTimelineSelection, setManualTimelineSelection] = useState<TimelineRange | null>(null)
  const [timelineHistory, setTimelineHistory] = useState(() => createTimelineHistory())
  const clips = timelineHistory.present.clips
  const activeClipId = timelineHistory.present.activeClipId
  const exportClipDrafts = timelineHistory.present.clipDrafts
  const assembly = timelineHistory.present.assembly
  const assemblyTracks = assembly.tracks
  const activeAssemblyTrackId = assembly.activeTrackId
  const activeAssemblyItemId = assembly.activeItemId
  const assemblyZoom = assembly.zoom
  const assemblySubtitleOverlaysEnabled = assembly.subtitleOverlaysEnabled
  const canUndoTimeline = timelineHistory.past.length > 0
  const canRedoTimeline = timelineHistory.future.length > 0

  const [semanticBlocks, setSemanticBlocks] = useState<SemanticBlock[]>([])
  const [isScoring, setIsScoring] = useState(false)
  const [isHooking, setIsHooking] = useState(false)
  const [isPlanning, setIsPlanning] = useState(false)
  const [isSegmenting, setIsSegmenting] = useState(false)
  const [isThumbnailing, setIsThumbnailing] = useState(false)

  const [viralScore, setViralScore] = useState<number | null>(null)
  const [viralInsights, setViralInsights] = useState<ViralInsight[]>([])
  const [hookCandidates, setHookCandidates] = useState<HookCandidate[]>([])
  const [contentPlanIdeas, setContentPlanIdeas] = useState<ContentPlanIdea[]>([])
  const [seriesSegments, setSeriesSegments] = useState<SeriesSegment[]>([])
  const [videoAnalysis, setVideoAnalysis] = useState<VideoAnalysisReport | null>(null)
  const [isAnalyzingVideo, setIsAnalyzingVideo] = useState(false)

  const [subtitlePresetOptions, setSubtitlePresetOptions] = useState<SubtitlePreset[]>(
    subtitlePresets,
  )
  const [platformPresetOptions, setPlatformPresetOptions] = useState<PlatformPreset[]>(
    platformPresets,
  )
  const [activeSubtitlePresetId, setActiveSubtitlePresetId] = useState<string>(
    subtitlePresetOptions[0]?.id ?? "",
  )
  const [selectedPlatformPresetIds, setSelectedPlatformPresetIds] = useState<string[]>(
    defaultPlatformSelection,
  )
  const [thumbnailTemplates, setThumbnailTemplates] = useState<ThumbnailTemplate[]>([])
  const [activeThumbnailTemplateId, setActiveThumbnailTemplateId] = useState<string>("")

  const visibleWords = useMemo(
    () => words.slice(0, visibleWordCount),
    [visibleWordCount, words],
  )

  const visibleTranscriptBlocks = useMemo(
    () => transcriptBlocks.filter((block) => block.wordStart < visibleWordCount),
    [transcriptBlocks, visibleWordCount],
  )

  const activeTranscriptBlockId = useMemo(() => {
    const activeBlock = visibleTranscriptBlocks.find(
      (block) => currentTime >= block.start && currentTime <= block.end,
    )
    return activeBlock?.id ?? null
  }, [currentTime, visibleTranscriptBlocks])

  const activeWordIndex = useMemo(() => {
    return findWordIndexByTime(words, visibleWordCount, currentTime)
  }, [currentTime, visibleWordCount, words])

  const derivedTimeSelection = useMemo<TimelineRange | null>(() => {
    if (!selection) {
      if (!manualTimelineSelection) {
        return null
      }
      const maxDuration = duration > 0 ? duration : MAX_TIMELINE_DURATION_SECONDS
      const start = clamp(
        Math.min(manualTimelineSelection.start, manualTimelineSelection.end),
        0,
        maxDuration,
      )
      const end = clamp(
        Math.max(manualTimelineSelection.start, manualTimelineSelection.end),
        0,
        maxDuration,
      )
      if (end - start <= 0.0001) {
        return null
      }
      return { start, end }
    }
    const startWord = words[selection.start]
    const endWord = words[selection.end]
    if (!startWord || !endWord) {
      return null
    }
    return { start: startWord.start, end: endWord.end }
  }, [duration, manualTimelineSelection, selection, words])

  const activeSubtitlePreset = useMemo<SubtitlePreset | undefined>(
    () => subtitlePresetOptions.find((preset) => preset.id === activeSubtitlePresetId),
    [activeSubtitlePresetId, subtitlePresetOptions],
  )

  const selectedPlatformPresets = useMemo<PlatformPreset[]>(
    () => platformPresetOptions.filter((preset) => selectedPlatformPresetIds.includes(preset.id)),
    [platformPresetOptions, selectedPlatformPresetIds],
  )

  const isAnyProcessing =
    isAnalyzingVideo ||
    isTranscribing ||
    isScoring ||
    isHooking ||
    isPlanning ||
    isSegmenting ||
    isThumbnailing

  const clearObjectUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
  }, [])

  const clearTimers = useCallback(() => {
    for (const timerId of scheduledTimersRef.current) {
      window.clearTimeout(timerId)
    }
    scheduledTimersRef.current = []
  }, [])

  const clearVideoAnalysisTimer = useCallback(() => {
    if (videoAnalysisTimerRef.current) {
      window.clearTimeout(videoAnalysisTimerRef.current)
      videoAnalysisTimerRef.current = null
    }
  }, [])

  const schedule = useCallback((fn: () => void, ms: number) => {
    const timerId = window.setTimeout(fn, ms)
    scheduledTimersRef.current.push(timerId)
  }, [])

  const stopStreaming = useCallback(() => {
    if (streamIntervalRef.current) {
      window.clearInterval(streamIntervalRef.current)
      streamIntervalRef.current = null
    }
  }, [])

  const flushCurrentTime = useCallback(() => {
    if (currentTimeRafRef.current) {
      window.cancelAnimationFrame(currentTimeRafRef.current)
      currentTimeRafRef.current = null
    }
    pendingCurrentTimeRef.current = null
  }, [])

  const startMockVideoAnalysis = useCallback(
    (params: {
      duration: number
      width: number
      height: number
      fileName: string
    }) => {
      clearVideoAnalysisTimer()
      const requestId = ++videoAnalysisRequestRef.current
      setIsAnalyzingVideo(true)
      const timerId = window.setTimeout(() => {
        if (requestId !== videoAnalysisRequestRef.current) {
          return
        }
        setVideoAnalysis(
          buildMockVideoAnalysis({
            projectName,
            videoName: params.fileName,
            duration: params.duration,
            width: params.width,
            height: params.height,
          }),
        )
        setIsAnalyzingVideo(false)
        videoAnalysisTimerRef.current = null
      }, 880)
      videoAnalysisTimerRef.current = timerId
    },
    [clearVideoAnalysisTimer, projectName],
  )

  const resetDerivedStates = useCallback(() => {
    setSelection(null)
    setManualTimelineSelection(null)
    selectionAnchorRef.current = null
    setTimelineHistory(createTimelineHistory())
    setIsScoring(false)
    setIsHooking(false)
    setIsPlanning(false)
    setIsSegmenting(false)
    setIsThumbnailing(false)
    setViralScore(null)
    setViralInsights([])
    setHookCandidates([])
    setContentPlanIdeas([])
    setSeriesSegments([])
    setThumbnailTemplates([])
    setActiveThumbnailTemplateId("")
    setActiveSubtitlePresetId((current) => current || subtitlePresetOptions[0]?.id || "")
    setSelectedPlatformPresetIds(defaultPlatformSelection)
  }, [subtitlePresetOptions])

  const runPostTranscriptionPipeline = useCallback(
    (payload: WorkspaceMockPayload) => {
      setIsScoring(true)
      schedule(() => {
        setViralScore(payload.viralScore)
        setViralInsights(payload.viralInsights)
        setIsScoring(false)

        setIsHooking(true)
        setIsPlanning(true)
        setIsSegmenting(true)
        setIsThumbnailing(true)

        schedule(() => {
          setHookCandidates(payload.hookCandidates)
          setIsHooking(false)
        }, 620)
        schedule(() => {
          setContentPlanIdeas(payload.contentPlanIdeas)
          setIsPlanning(false)
        }, 780)
        schedule(() => {
          setSeriesSegments(payload.seriesSegments)
          setIsSegmenting(false)
        }, 980)
        schedule(() => {
          setThumbnailTemplates(payload.thumbnailTemplates)
          setActiveThumbnailTemplateId(payload.thumbnailTemplates[0]?.id ?? "")
          setIsThumbnailing(false)
        }, 1140)
      }, 780)
    },
    [schedule],
  )

  const startMockTranscription = useCallback(
    async (videoDuration: number) => {
      stopStreaming()
      clearTimers()
      pipelineStartedRef.current = false
      pendingPipelinePayloadRef.current = null
      const requestId = ++transcriptionRequestRef.current

      const normalizedDuration = Math.max(videoDuration, 60)
      const payload = await generateWorkspaceMockViaBackend(
        projectName,
        normalizedDuration,
      )
      if (requestId !== transcriptionRequestRef.current) {
        return
      }

      const generatedWords = payload.words
      const blocks = payload.semanticBlocks
      const generatedTranscriptBlocks = payload.transcriptBlocks

      resetDerivedStates()
      setWords(generatedWords)
      setSemanticBlocks(blocks)
      setTranscriptBlocks(generatedTranscriptBlocks)
      const normalizedPayloadPresets = normalizeSubtitlePresetCollection(payload.subtitlePresets)
      setSubtitlePresetOptions(normalizedPayloadPresets)
      setPlatformPresetOptions(payload.platformPresets)
      setActiveSubtitlePresetId(
        payload.activeSubtitlePresetId || normalizedPayloadPresets[0]?.id || "",
      )
      setSelectedPlatformPresetIds(
        payload.defaultSelectedPlatformPresetIds.length > 0
          ? payload.defaultSelectedPlatformPresetIds
          : payload.platformPresets.slice(0, 2).map((preset) => preset.id),
      )
      setVisibleWordCount(0)
      visibleWordCountRef.current = 0
      setIsTranscribing(true)
      pendingPipelinePayloadRef.current = payload
      streamIntervalRef.current = window.setInterval(() => {
        const revealBatch = Math.max(5, Math.floor(Math.random() * 10) + 4)
        const nextVisibleCount = Math.min(
          visibleWordCountRef.current + revealBatch,
          generatedWords.length,
        )
        if (nextVisibleCount !== visibleWordCountRef.current) {
          visibleWordCountRef.current = nextVisibleCount
          setVisibleWordCount(nextVisibleCount)
        }
        if (nextVisibleCount >= generatedWords.length && !pipelineStartedRef.current) {
          pipelineStartedRef.current = true
          stopStreaming()
          setIsTranscribing(false)
          const pipelinePayload = pendingPipelinePayloadRef.current
          pendingPipelinePayloadRef.current = null
          if (pipelinePayload) {
            runPostTranscriptionPipeline(pipelinePayload)
          }
        }
      }, 120)
    },
    [
      clearTimers,
      projectName,
      resetDerivedStates,
      runPostTranscriptionPipeline,
      stopStreaming,
    ],
  )

  const setUploadedVideo = useCallback(
    (file: File) => {
      clearObjectUrl()
      stopStreaming()
      clearTimers()
      clearVideoAnalysisTimer()
      pendingPipelinePayloadRef.current = null
      videoAnalysisRequestRef.current += 1

      const objectUrl = URL.createObjectURL(file)
      objectUrlRef.current = objectUrl

      setVideoUrl(objectUrl)
      setVideoName(file.name)
      setDuration(0)
      setCurrentTime(0)
      setVideoWidth(0)
      setVideoHeight(0)
      setWords([])
      setTranscriptBlocks([])
      setSemanticBlocks([])
      setVisibleWordCount(0)
      visibleWordCountRef.current = 0
      setIsTranscribing(false)
      setIsAnalyzingVideo(false)
      setVideoAnalysis(null)
      resetDerivedStates()

      const metadataProbe = document.createElement("video")
      metadataProbe.preload = "metadata"
      metadataProbe.src = objectUrl
      metadataProbe.onloadedmetadata = () => {
        const detectedDuration = metadataProbe.duration || 0
        const detectedWidth = metadataProbe.videoWidth || 0
        const detectedHeight = metadataProbe.videoHeight || 0
        setDuration(detectedDuration)
        setVideoWidth(detectedWidth)
        setVideoHeight(detectedHeight)
        startMockVideoAnalysis({
          duration: detectedDuration || 120,
          width: detectedWidth,
          height: detectedHeight,
          fileName: file.name,
        })
      }
    },
    [
      clearObjectUrl,
      clearTimers,
      clearVideoAnalysisTimer,
      resetDerivedStates,
      startMockVideoAnalysis,
      stopStreaming,
    ],
  )

  const setImportedVideoPath = useCallback(
    (
      mediaPath: string,
      options?: {
        preserveWorkspaceState?: boolean
      },
    ) => {
      clearObjectUrl()
      stopStreaming()
      clearTimers()
      clearVideoAnalysisTimer()
      pendingPipelinePayloadRef.current = null
      videoAnalysisRequestRef.current += 1
      setIsAnalyzingVideo(false)
      const preserveWorkspaceState = options?.preserveWorkspaceState ?? false

      const trimmedPath = mediaPath.trim()
      if (!trimmedPath) {
        return
      }

      const isAbsoluteWindowsPath = /^[a-zA-Z]:[\\/]/.test(trimmedPath)
      const isAbsolutePosixPath = trimmedPath.startsWith("/")
      const isExtendedWindowsPath = trimmedPath.startsWith("\\\\?\\")
      const isUncPath = trimmedPath.startsWith("\\\\")
      const hasHttpLikeScheme = /^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\//.test(trimmedPath)
      const isFilesystemPath =
        isAbsoluteWindowsPath || isAbsolutePosixPath || isExtendedWindowsPath || isUncPath
      const shouldTreatAsFilesystemPath =
        isFilesystemPath || (!hasHttpLikeScheme && !trimmedPath.startsWith("data:"))

      const sourceUrl =
        isTauriRuntime() && shouldTreatAsFilesystemPath
          ? convertFileSrc(trimmedPath)
          : trimmedPath
      const fileName = trimmedPath.split(/[\\/]/).pop() || "Imported video"

      setVideoUrl(sourceUrl)
      setVideoName(fileName)
      if (!preserveWorkspaceState) {
        setDuration(0)
        setCurrentTime(0)
        setVideoWidth(0)
        setVideoHeight(0)
        setWords([])
        setTranscriptBlocks([])
        setSemanticBlocks([])
        setVisibleWordCount(0)
        visibleWordCountRef.current = 0
        setIsTranscribing(false)
        setIsAnalyzingVideo(false)
        setVideoAnalysis(null)
        resetDerivedStates()
      }

      const metadataProbe = document.createElement("video")
      metadataProbe.preload = "metadata"
      metadataProbe.src = sourceUrl
      metadataProbe.onloadedmetadata = () => {
        const detectedDuration = metadataProbe.duration || 0
        const detectedWidth = metadataProbe.videoWidth || 0
        const detectedHeight = metadataProbe.videoHeight || 0
        if (detectedDuration > 0) {
          setDuration((current) =>
            preserveWorkspaceState && current > 0 ? current : detectedDuration,
          )
        }
        setVideoWidth(detectedWidth)
        setVideoHeight(detectedHeight)
        startMockVideoAnalysis({
          duration: detectedDuration || duration || 120,
          width: detectedWidth,
          height: detectedHeight,
          fileName,
        })
      }
    },
    [
      clearObjectUrl,
      clearTimers,
      clearVideoAnalysisTimer,
      duration,
      resetDerivedStates,
      startMockVideoAnalysis,
      stopStreaming,
    ],
  )

  const startTranscription = useCallback(() => {
    if (isTranscribing || !videoUrl.trim()) {
      return
    }
    const normalizedDuration = duration > 0 ? duration : 120
    void startMockTranscription(normalizedDuration)
  }, [duration, isTranscribing, startMockTranscription, videoUrl])

  const clearSelection = useCallback(() => {
    setSelection(null)
    setManualTimelineSelection(null)
    selectionAnchorRef.current = null
  }, [])

  const setSelectionRange = useCallback((startIndex: number, endIndex: number) => {
    if (words.length === 0 || visibleWordCount <= 0) {
      return
    }
    const maxSelectableIndex = Math.max(0, Math.min(words.length, visibleWordCount) - 1)
    const boundedStart = clamp(Math.min(startIndex, endIndex), 0, maxSelectableIndex)
    const boundedEnd = clamp(Math.max(startIndex, endIndex), 0, maxSelectableIndex)
    if (boundedEnd < boundedStart) {
      return
    }
    setSelection({ start: boundedStart, end: boundedEnd })
    setManualTimelineSelection(null)
    selectionAnchorRef.current = boundedStart
  }, [visibleWordCount, words.length])

  const selectWord = useCallback((index: number, extendSelection = false) => {
    if (words.length === 0 || visibleWordCount <= 0) {
      return
    }
    const maxSelectableIndex = Math.max(0, Math.min(words.length, visibleWordCount) - 1)
    const boundedIndex = clamp(index, 0, maxSelectableIndex)
    setManualTimelineSelection(null)
    setSelection((previous) => {
      if (!extendSelection) {
        selectionAnchorRef.current = boundedIndex
        return { start: boundedIndex, end: boundedIndex }
      }

      const anchor = clamp(
        selectionAnchorRef.current ?? previous?.start ?? boundedIndex,
        0,
        maxSelectableIndex,
      )
      selectionAnchorRef.current = anchor
      return {
        start: Math.min(anchor, boundedIndex),
        end: Math.max(anchor, boundedIndex),
      }
    })
  }, [visibleWordCount, words.length])

  const applyTimelineRange = useCallback(
    (range: TimelineRange | null) => {
      if (!range) {
        clearSelection()
        return
      }
      const visibleLimit = Math.min(words.length, visibleWordCount)
      if (visibleLimit <= 0) {
        const maxDuration = duration > 0 ? duration : MAX_TIMELINE_DURATION_SECONDS
        const start = clamp(Math.min(range.start, range.end), 0, maxDuration)
        const end = clamp(Math.max(range.start, range.end), 0, maxDuration)
        setSelection(null)
        selectionAnchorRef.current = null
        setManualTimelineSelection(end - start > 0.0001 ? { start, end } : null)
        return
      }

      const visibleSubset = words.slice(0, visibleLimit)
      const startIndex = visibleSubset.findIndex((word) => word.end >= range.start)
      let endIndex = -1
      for (let index = visibleSubset.length - 1; index >= 0; index -= 1) {
        if (visibleSubset[index].start <= range.end) {
          endIndex = index
          break
        }
      }
      if (startIndex === -1 || endIndex === -1) {
        return
      }
      setSelection({ start: startIndex, end: endIndex })
      setManualTimelineSelection(null)
      selectionAnchorRef.current = startIndex
    },
    [clearSelection, duration, visibleWordCount, words],
  )

  const setActiveClipId = useCallback((clipId: string | null) => {
    setTimelineHistory((previous) =>
      updateTimelineHistory(
        previous,
        (snapshot) => ({
          ...snapshot,
          activeClipId: clipId,
        }),
        { recordHistory: false },
      ),
    )
  }, [])

  const undoTimeline = useCallback(() => {
    setTimelineHistory((previous) => undoTimelineHistory(previous))
  }, [])

  const redoTimeline = useCallback(() => {
    setTimelineHistory((previous) => redoTimelineHistory(previous))
  }, [])

  const sanitizeSubtitleAvailabilityInDrafts = useCallback(
    (drafts: Record<string, ExportClipDraft>): Record<string, ExportClipDraft> => {
      if (words.length > 0) {
        return drafts
      }
      let changed = false
      const next: Record<string, ExportClipDraft> = {}
      for (const [clipId, draft] of Object.entries(drafts)) {
        if (draft.subtitleEnabled) {
          changed = true
          next[clipId] = {
            ...draft,
            subtitleEnabled: false,
          }
        } else {
          next[clipId] = draft
        }
      }
      return changed ? next : drafts
    },
    [words.length],
  )

  const setExportClipDrafts = useCallback(
    (
      nextDrafts: Record<string, ExportClipDraft>,
      options?: {
        recordHistory?: boolean
      },
    ) => {
      const sanitizedDrafts = sanitizeSubtitleAvailabilityInDrafts(nextDrafts)
      setTimelineHistory((previous) =>
        updateTimelineHistory(
          previous,
          (snapshot) => ({
            ...snapshot,
            clipDrafts: sanitizedDrafts,
          }),
          { recordHistory: options?.recordHistory ?? true },
        ),
      )
    },
    [sanitizeSubtitleAvailabilityInDrafts],
  )

  const buildAssemblyFromClips = useCallback((sourceClips: ClipSegment[]): ClipAssemblyState => {
    const sorted = [...sourceClips].sort((left, right) => {
      if (Math.abs(left.start - right.start) > 0.0001) {
        return left.start - right.start
      }
      if (Math.abs(left.end - right.end) > 0.0001) {
        return left.end - right.end
      }
      return left.id.localeCompare(right.id)
    })
    let cursor = 0
    const items: ClipAssemblyItem[] = sorted.map((clip, index) => {
      const clipDuration = Math.max(MIN_CLIP_DURATION_SECONDS, clip.end - clip.start)
      const start = cursor
      const end = start + clipDuration
      cursor = end
      return {
        id: `asm_clip_${clip.id}_${index}`,
        label: clip.title,
        sourceType: "clip",
        sourceClipId: clip.id,
        sourcePath: null,
        timelineStart: start,
        timelineEnd: end,
        sourceIn: clip.start,
        sourceOut: clip.end,
        volume: 1,
        opacity: 1,
        muted: false,
      }
    })
    return {
      tracks: [
        {
          id: "asm_track_video_1",
          name: "V1",
          type: "video",
          muted: false,
          hidden: false,
          locked: false,
          items,
        },
        {
          id: "asm_track_audio_1",
          name: "A1",
          type: "audio",
          muted: false,
          hidden: false,
          locked: false,
          items: [],
        },
      ],
      activeTrackId: "asm_track_video_1",
      activeItemId: items[0]?.id ?? null,
      zoom: 1,
      subtitleOverlaysEnabled: false,
    }
  }, [])

  const isSourceTypeCompatibleWithTrack = (
    sourceType: ClipAssemblyItem["sourceType"],
    trackType: ClipAssemblyTrackType,
  ) => {
    if (trackType === "video") {
      return sourceType === "clip" || sourceType === "video-file"
    }
    return sourceType === "audio-file"
  }

  const setActiveAssemblyTrackId = useCallback((trackId: string | null) => {
    setTimelineHistory((previous) =>
      updateTimelineHistory(
        previous,
        (snapshot) => ({
          ...snapshot,
          assembly: {
            ...snapshot.assembly,
            activeTrackId: trackId,
          },
        }),
        { recordHistory: false },
      ),
    )
  }, [])

  const setActiveAssemblyItemId = useCallback((itemId: string | null) => {
    setTimelineHistory((previous) =>
      updateTimelineHistory(
        previous,
        (snapshot) => ({
          ...snapshot,
          assembly: {
            ...snapshot.assembly,
            activeItemId: itemId,
          },
        }),
        { recordHistory: false },
      ),
    )
  }, [])

  const setAssemblyZoom = useCallback(
    (
      nextZoom: number,
      options?: {
        recordHistory?: boolean
      },
    ) => {
      if (!Number.isFinite(nextZoom)) {
        return
      }
      setTimelineHistory((previous) =>
        updateTimelineHistory(
          previous,
          (snapshot) => ({
            ...snapshot,
            assembly: {
              ...snapshot.assembly,
              zoom: clamp(nextZoom, MIN_ASSEMBLY_ZOOM, MAX_ASSEMBLY_ZOOM),
            },
          }),
          { recordHistory: options?.recordHistory ?? true },
        ),
      )
    },
    [],
  )

  const setAssemblySubtitleOverlaysEnabled = useCallback((enabled: boolean) => {
    setTimelineHistory((previous) =>
      updateTimelineHistory(
        previous,
        (snapshot) => ({
          ...snapshot,
          assembly: {
            ...snapshot.assembly,
            subtitleOverlaysEnabled: Boolean(enabled),
          },
        }),
        { recordHistory: false },
      ),
    )
  }, [])

  const resetAssemblyFromClips = useCallback(() => {
    setTimelineHistory((previous) =>
      updateTimelineHistory(previous, (snapshot) => ({
        ...snapshot,
        assembly: buildAssemblyFromClips(snapshot.clips),
      })),
    )
  }, [buildAssemblyFromClips])

  const addAssemblyTrack = useCallback((type: ClipAssemblyTrackType) => {
    setTimelineHistory((previous) =>
      updateTimelineHistory(previous, (snapshot) => {
        const targetType: ClipAssemblyTrackType = type === "audio" ? "audio" : "video"
        const count = snapshot.assembly.tracks.filter((track) => track.type === targetType).length
        const trackId = `asm_track_${targetType}_${Date.now().toString(36)}`
        const nextTrack: ClipAssemblyTrack = {
          id: trackId,
          name: `${targetType === "video" ? "V" : "A"}${count + 1}`,
          type: targetType,
          muted: false,
          hidden: false,
          locked: false,
          items: [],
        }
        const nextTracks = [...snapshot.assembly.tracks]
        if (targetType === "video") {
          const firstVideoIndex = nextTracks.findIndex((track) => track.type === "video")
          const firstAudioIndex = nextTracks.findIndex((track) => track.type === "audio")
          const insertIndex = firstVideoIndex >= 0 ? firstVideoIndex : firstAudioIndex >= 0 ? firstAudioIndex : 0
          nextTracks.splice(insertIndex, 0, nextTrack)
        } else {
          nextTracks.push(nextTrack)
        }
        return {
          ...snapshot,
          assembly: {
            ...snapshot.assembly,
            tracks: nextTracks,
            activeTrackId: trackId,
          },
        }
      }),
    )
  }, [])

  const removeAssemblyTrack = useCallback((trackId: string) => {
    setTimelineHistory((previous) =>
      updateTimelineHistory(previous, (snapshot) => {
        const target = snapshot.assembly.tracks.find((track) => track.id === trackId)
        if (!target) {
          return snapshot
        }
        const sameTypeCount = snapshot.assembly.tracks.filter((track) => track.type === target.type).length
        if (sameTypeCount <= 1) {
          return snapshot
        }
        const nextTracks = snapshot.assembly.tracks.filter((track) => track.id !== trackId)
        const removedItemIds = new Set(target.items.map((item) => item.id))
        const fallbackTrack = nextTracks.find((track) => track.type === target.type) ?? nextTracks[0] ?? null
        return {
          ...snapshot,
          assembly: {
            ...snapshot.assembly,
            tracks: nextTracks,
            activeTrackId:
              snapshot.assembly.activeTrackId === trackId
                ? (fallbackTrack?.id ?? null)
                : snapshot.assembly.activeTrackId,
            activeItemId:
              snapshot.assembly.activeItemId && removedItemIds.has(snapshot.assembly.activeItemId)
                ? null
                : snapshot.assembly.activeItemId,
          },
        }
      }),
    )
  }, [])

  const renameAssemblyTrack = useCallback((trackId: string, name: string) => {
    const nextName = name.trim()
    if (!nextName) {
      return
    }
    setTimelineHistory((previous) =>
      updateTimelineHistory(
        previous,
        (snapshot) => ({
          ...snapshot,
          assembly: {
            ...snapshot.assembly,
            tracks: snapshot.assembly.tracks.map((track) =>
              track.id === trackId
                ? {
                    ...track,
                    name: nextName,
                  }
                : track,
            ),
          },
        }),
        { recordHistory: false },
      ),
    )
  }, [])

  const toggleAssemblyTrackMuted = useCallback((trackId: string) => {
    setTimelineHistory((previous) =>
      updateTimelineHistory(
        previous,
        (snapshot) => ({
          ...snapshot,
          assembly: {
            ...snapshot.assembly,
            tracks: snapshot.assembly.tracks.map((track) =>
              track.id === trackId ? { ...track, muted: !track.muted } : track,
            ),
          },
        }),
        { recordHistory: false },
      ),
    )
  }, [])

  const toggleAssemblyTrackLocked = useCallback((trackId: string) => {
    setTimelineHistory((previous) =>
      updateTimelineHistory(
        previous,
        (snapshot) => ({
          ...snapshot,
          assembly: {
            ...snapshot.assembly,
            tracks: snapshot.assembly.tracks.map((track) =>
              track.id === trackId ? { ...track, locked: !track.locked } : track,
            ),
          },
        }),
        { recordHistory: false },
      ),
    )
  }, [])

  const toggleAssemblyTrackHidden = useCallback((trackId: string) => {
    setTimelineHistory((previous) =>
      updateTimelineHistory(
        previous,
        (snapshot) => ({
          ...snapshot,
          assembly: {
            ...snapshot.assembly,
            tracks: snapshot.assembly.tracks.map((track) =>
              track.id === trackId ? { ...track, hidden: !track.hidden } : track,
            ),
          },
        }),
        { recordHistory: false },
      ),
    )
  }, [])

  const appendClipToAssemblyTrack = useCallback(
    (clipId: string, trackId?: string | null) => {
      setTimelineHistory((previous) =>
        updateTimelineHistory(previous, (snapshot) => {
          const clip = snapshot.clips.find((item) => item.id === clipId)
          if (!clip) {
            return snapshot
          }
          const selectedTrackId = trackId ?? snapshot.assembly.activeTrackId
          const selectedTrack = snapshot.assembly.tracks.find((track) => track.id === selectedTrackId)
          const targetTrack =
            (selectedTrack &&
            !selectedTrack.locked &&
            isSourceTypeCompatibleWithTrack("clip", selectedTrack.type)
              ? selectedTrack
              : null) ??
            snapshot.assembly.tracks.find(
              (track) => !track.locked && isSourceTypeCompatibleWithTrack("clip", track.type),
            )
          if (!targetTrack || targetTrack.locked) {
            return snapshot
          }
          const targetSourceType: ClipAssemblyItem["sourceType"] = "clip"
          if (!isSourceTypeCompatibleWithTrack(targetSourceType, targetTrack.type)) {
            return snapshot
          }
          const start = targetTrack.items.reduce(
            (maxValue, item) => Math.max(maxValue, item.timelineEnd),
            0,
          )
          const clipDuration = Math.max(MIN_CLIP_DURATION_SECONDS, clip.end - clip.start)
          const itemId = `asm_item_${clip.id}_${Math.random().toString(36).slice(2, 8)}`
          const nextItem: ClipAssemblyItem = {
            id: itemId,
            label: clip.title,
            sourceType: targetSourceType,
            sourceClipId: clip.id,
            sourcePath: null,
            timelineStart: start,
            timelineEnd: start + clipDuration,
            sourceIn: clip.start,
            sourceOut: clip.end,
            volume: 1,
            opacity: 1,
            muted: false,
          }
          return {
            ...snapshot,
            activeClipId: clip.id,
            assembly: {
              ...snapshot.assembly,
              activeTrackId: targetTrack.id,
              activeItemId: itemId,
              tracks: snapshot.assembly.tracks.map((track) =>
                track.id === targetTrack.id
                  ? {
                      ...track,
                      items: [...track.items, nextItem],
                    }
                  : track,
              ),
            },
          }
        }),
      )
    },
    [],
  )

  const appendExternalMediaToAssemblyTrack = useCallback(
    (
      payload: {
        sourceType: "video-file" | "audio-file"
        label: string
        sourcePath: string | null
        duration?: number
      },
      trackId?: string | null,
    ) => {
      setTimelineHistory((previous) =>
        updateTimelineHistory(previous, (snapshot) => {
          const selectedTrackId = trackId ?? snapshot.assembly.activeTrackId
          const preferredTrackType: ClipAssemblyTrackType =
            payload.sourceType === "audio-file" ? "audio" : "video"
          const selectedTrack = snapshot.assembly.tracks.find((track) => track.id === selectedTrackId)
          const targetTrack =
            (selectedTrack &&
            !selectedTrack.locked &&
            isSourceTypeCompatibleWithTrack(payload.sourceType, selectedTrack.type)
              ? selectedTrack
              : null) ??
            snapshot.assembly.tracks.find(
              (track) =>
                !track.locked &&
                track.type === preferredTrackType &&
                isSourceTypeCompatibleWithTrack(payload.sourceType, track.type),
            ) ??
            snapshot.assembly.tracks.find(
              (track) =>
                !track.locked && isSourceTypeCompatibleWithTrack(payload.sourceType, track.type),
            )
          if (!targetTrack || targetTrack.locked) {
            return snapshot
          }
          if (!isSourceTypeCompatibleWithTrack(payload.sourceType, targetTrack.type)) {
            return snapshot
          }
          const start = targetTrack.items.reduce(
            (maxValue, item) => Math.max(maxValue, item.timelineEnd),
            0,
          )
          const durationSeconds =
            typeof payload.duration === "number" && Number.isFinite(payload.duration)
              ? Math.max(MIN_ASSEMBLY_ITEM_DURATION_SECONDS, payload.duration)
              : payload.sourceType === "audio-file"
                ? 12
                : 6
          const itemId = `asm_import_${Math.random().toString(36).slice(2, 8)}`
          const nextItem: ClipAssemblyItem = {
            id: itemId,
            label: payload.label.trim() || (payload.sourceType === "audio-file" ? "Audio" : "Video"),
            sourceType: payload.sourceType,
            sourceClipId: null,
            sourcePath: payload.sourcePath,
            timelineStart: start,
            timelineEnd: start + durationSeconds,
            sourceIn: 0,
            sourceOut: durationSeconds,
            volume: 1,
            opacity: payload.sourceType === "audio-file" ? 1 : 0.9,
            muted: false,
          }
          return {
            ...snapshot,
            assembly: {
              ...snapshot.assembly,
              activeTrackId: targetTrack.id,
              activeItemId: itemId,
              tracks: snapshot.assembly.tracks.map((track) =>
                track.id === targetTrack.id
                  ? {
                      ...track,
                      items: [...track.items, nextItem],
                    }
                  : track,
              ),
            },
          }
        }),
      )
    },
    [],
  )

  const setAssemblyItemRange = useCallback(
    (
      itemId: string,
      start: number,
      end: number,
      options?: {
        targetTrackId?: string | null
        recordHistory?: boolean
      },
    ) => {
      if (!Number.isFinite(start) || !Number.isFinite(end)) {
        return
      }
      setTimelineHistory((previous) =>
        updateTimelineHistory(
          previous,
          (snapshot) => {
            const tracks = snapshot.assembly.tracks
            let sourceTrack: ClipAssemblyTrack | null = null
            let sourceItem: ClipAssemblyItem | null = null
            for (const track of tracks) {
              const candidate = track.items.find((item) => item.id === itemId)
              if (candidate) {
                sourceTrack = track
                sourceItem = candidate
                break
              }
            }
            if (!sourceTrack || !sourceItem || sourceTrack.locked) {
              return snapshot
            }
            const normalizedStart = clamp(Math.min(start, end), 0, MAX_TIMELINE_DURATION_SECONDS)
            const minEnd = Math.min(
              MAX_TIMELINE_DURATION_SECONDS,
              normalizedStart + MIN_ASSEMBLY_ITEM_DURATION_SECONDS,
            )
            const normalizedEnd = clamp(
              Math.max(start, end),
              minEnd,
              MAX_TIMELINE_DURATION_SECONDS,
            )
            const explicitTargetTrack = options?.targetTrackId
              ? tracks.find((track) => track.id === options.targetTrackId)
              : null
            const targetTrack =
              explicitTargetTrack &&
              !explicitTargetTrack.locked &&
              isSourceTypeCompatibleWithTrack(sourceItem.sourceType, explicitTargetTrack.type)
                ? explicitTargetTrack
                : sourceTrack
            const previousTimelineDuration = Math.max(
              MIN_ASSEMBLY_ITEM_DURATION_SECONDS,
              sourceItem.timelineEnd - sourceItem.timelineStart,
            )
            const nextTimelineDuration = Math.max(
              MIN_ASSEMBLY_ITEM_DURATION_SECONDS,
              normalizedEnd - normalizedStart,
            )
            const previousSourceDuration = Math.max(0.0001, sourceItem.sourceOut - sourceItem.sourceIn)
            const sourcePerTimelineSecond = previousSourceDuration / previousTimelineDuration
            const startChanged = Math.abs(normalizedStart - sourceItem.timelineStart) > 0.0001
            const endChanged = Math.abs(normalizedEnd - sourceItem.timelineEnd) > 0.0001
            const movedWithoutTrim =
              startChanged &&
              endChanged &&
              Math.abs(nextTimelineDuration - previousTimelineDuration) < 0.0001
            let nextSourceIn = sourceItem.sourceIn
            let nextSourceOut = sourceItem.sourceOut
            if (!movedWithoutTrim && (startChanged || endChanged)) {
              if (startChanged && !endChanged) {
                nextSourceIn = clamp(
                  sourceItem.sourceIn +
                    (normalizedStart - sourceItem.timelineStart) * sourcePerTimelineSecond,
                  0,
                  sourceItem.sourceOut - 0.0001,
                )
              } else if (!startChanged && endChanged) {
                nextSourceOut = clamp(
                  sourceItem.sourceIn + nextTimelineDuration * sourcePerTimelineSecond,
                  sourceItem.sourceIn + 0.0001,
                  MAX_TIMELINE_DURATION_SECONDS,
                )
              } else {
                nextSourceIn = clamp(
                  sourceItem.sourceIn +
                    (normalizedStart - sourceItem.timelineStart) * sourcePerTimelineSecond,
                  0,
                  MAX_TIMELINE_DURATION_SECONDS - 0.0001,
                )
                nextSourceOut = clamp(
                  nextSourceIn + nextTimelineDuration * sourcePerTimelineSecond,
                  nextSourceIn + 0.0001,
                  MAX_TIMELINE_DURATION_SECONDS,
                )
              }
            }
            const updatedItem: ClipAssemblyItem = {
              ...sourceItem,
              timelineStart: normalizedStart,
              timelineEnd: normalizedEnd,
              sourceIn: nextSourceIn,
              sourceOut: nextSourceOut,
            }

            const nextTracks = tracks.map((track) => {
              if (track.id === sourceTrack.id && sourceTrack.id !== targetTrack.id) {
                return {
                  ...track,
                  items: track.items.filter((item) => item.id !== itemId),
                }
              }
              if (track.id === targetTrack.id) {
                const existingWithoutItem =
                  sourceTrack.id === targetTrack.id
                    ? track.items.filter((item) => item.id !== itemId)
                    : track.items
                return {
                  ...track,
                  items: [...existingWithoutItem, updatedItem],
                }
              }
              return track
            })

            return {
              ...snapshot,
              assembly: {
                ...snapshot.assembly,
                tracks: nextTracks,
                activeTrackId: targetTrack.id,
                activeItemId: itemId,
              },
            }
          },
          { recordHistory: options?.recordHistory ?? true },
        ),
      )
    },
    [],
  )

  const moveAssemblyItemToNewVideoTrackAbove = useCallback(
    (
      itemId: string,
      start: number,
      end: number,
      options?: {
        recordHistory?: boolean
      },
    ) => {
      if (!Number.isFinite(start) || !Number.isFinite(end)) {
        return
      }
      setTimelineHistory((previous) =>
        updateTimelineHistory(
          previous,
          (snapshot) => {
            const tracks = snapshot.assembly.tracks
            let sourceTrack: ClipAssemblyTrack | null = null
            let sourceItem: ClipAssemblyItem | null = null
            for (const track of tracks) {
              const candidate = track.items.find((item) => item.id === itemId)
              if (candidate) {
                sourceTrack = track
                sourceItem = candidate
                break
              }
            }
            if (!sourceTrack || !sourceItem || sourceTrack.locked || sourceItem.sourceType === "audio-file") {
              return snapshot
            }
            const normalizedStart = clamp(Math.min(start, end), 0, MAX_TIMELINE_DURATION_SECONDS)
            const minEnd = Math.min(
              MAX_TIMELINE_DURATION_SECONDS,
              normalizedStart + MIN_ASSEMBLY_ITEM_DURATION_SECONDS,
            )
            const normalizedEnd = clamp(
              Math.max(start, end),
              minEnd,
              MAX_TIMELINE_DURATION_SECONDS,
            )
            const previousTimelineDuration = Math.max(
              MIN_ASSEMBLY_ITEM_DURATION_SECONDS,
              sourceItem.timelineEnd - sourceItem.timelineStart,
            )
            const nextTimelineDuration = Math.max(
              MIN_ASSEMBLY_ITEM_DURATION_SECONDS,
              normalizedEnd - normalizedStart,
            )
            const previousSourceDuration = Math.max(0.0001, sourceItem.sourceOut - sourceItem.sourceIn)
            const sourcePerTimelineSecond = previousSourceDuration / previousTimelineDuration
            const startChanged = Math.abs(normalizedStart - sourceItem.timelineStart) > 0.0001
            const endChanged = Math.abs(normalizedEnd - sourceItem.timelineEnd) > 0.0001
            const movedWithoutTrim =
              startChanged &&
              endChanged &&
              Math.abs(nextTimelineDuration - previousTimelineDuration) < 0.0001
            let nextSourceIn = sourceItem.sourceIn
            let nextSourceOut = sourceItem.sourceOut
            if (!movedWithoutTrim && (startChanged || endChanged)) {
              if (startChanged && !endChanged) {
                nextSourceIn = clamp(
                  sourceItem.sourceIn +
                    (normalizedStart - sourceItem.timelineStart) * sourcePerTimelineSecond,
                  0,
                  sourceItem.sourceOut - 0.0001,
                )
              } else if (!startChanged && endChanged) {
                nextSourceOut = clamp(
                  sourceItem.sourceIn + nextTimelineDuration * sourcePerTimelineSecond,
                  sourceItem.sourceIn + 0.0001,
                  MAX_TIMELINE_DURATION_SECONDS,
                )
              } else {
                nextSourceIn = clamp(
                  sourceItem.sourceIn +
                    (normalizedStart - sourceItem.timelineStart) * sourcePerTimelineSecond,
                  0,
                  MAX_TIMELINE_DURATION_SECONDS - 0.0001,
                )
                nextSourceOut = clamp(
                  nextSourceIn + nextTimelineDuration * sourcePerTimelineSecond,
                  nextSourceIn + 0.0001,
                  MAX_TIMELINE_DURATION_SECONDS,
                )
              }
            }
            const updatedItem: ClipAssemblyItem = {
              ...sourceItem,
              timelineStart: normalizedStart,
              timelineEnd: normalizedEnd,
              sourceIn: nextSourceIn,
              sourceOut: nextSourceOut,
            }
            const videoTrackCount = tracks.filter((track) => track.type === "video").length
            const trackId = `asm_track_video_${Date.now().toString(36)}`
            const nextTrack: ClipAssemblyTrack = {
              id: trackId,
              name: `V${videoTrackCount + 1}`,
              type: "video",
              muted: false,
              hidden: false,
              locked: false,
              items: [updatedItem],
            }
            const tracksWithoutItem = tracks.map((track) =>
              track.id === sourceTrack.id
                ? {
                    ...track,
                    items: track.items.filter((item) => item.id !== itemId),
                  }
                : track,
            )
            const firstVideoIndex = tracksWithoutItem.findIndex((track) => track.type === "video")
            const insertIndex = firstVideoIndex >= 0 ? firstVideoIndex : 0
            const nextTracks = [...tracksWithoutItem]
            nextTracks.splice(insertIndex, 0, nextTrack)
            return {
              ...snapshot,
              assembly: {
                ...snapshot.assembly,
                tracks: nextTracks,
                activeTrackId: trackId,
                activeItemId: itemId,
              },
            }
          },
          { recordHistory: options?.recordHistory ?? true },
        ),
      )
    },
    [],
  )

  const removeAssemblyItem = useCallback((itemId: string) => {
    setTimelineHistory((previous) =>
      updateTimelineHistory(previous, (snapshot) => {
        let removedItem: ClipAssemblyItem | null = null
        for (const track of snapshot.assembly.tracks) {
          const found = track.items.find((item) => item.id === itemId)
          if (found) {
            removedItem = found
            break
          }
        }
        if (!removedItem) {
          return snapshot
        }

        const clipIdToRemove =
          removedItem.sourceType === "clip" ? removedItem.sourceClipId ?? null : null
        const shouldRemoveSourceClip =
          Boolean(clipIdToRemove) &&
          snapshot.clips.some((clip) => clip.id === clipIdToRemove)

        const removedItemIds = new Set<string>([itemId])
        if (clipIdToRemove && shouldRemoveSourceClip) {
          for (const track of snapshot.assembly.tracks) {
            for (const item of track.items) {
              if (item.sourceType === "clip" && item.sourceClipId === clipIdToRemove) {
                removedItemIds.add(item.id)
              }
            }
          }
        }

        const nextTracks = snapshot.assembly.tracks.map((track) => ({
          ...track,
          items: track.items.filter((item) => !removedItemIds.has(item.id)),
        }))
        const nextClips =
          clipIdToRemove && shouldRemoveSourceClip
            ? snapshot.clips.filter((clip) => clip.id !== clipIdToRemove)
            : snapshot.clips
        const nextClipDrafts =
          clipIdToRemove && shouldRemoveSourceClip
            ? (Object.fromEntries(
                Object.entries(snapshot.clipDrafts).filter(
                  ([draftClipId]) => draftClipId !== clipIdToRemove,
                ),
              ) as Record<string, ExportClipDraft>)
            : snapshot.clipDrafts
        const nextActiveClipId =
          clipIdToRemove && shouldRemoveSourceClip && snapshot.activeClipId === clipIdToRemove
            ? (nextClips[0]?.id ?? null)
            : snapshot.activeClipId

        return {
          ...snapshot,
          clips: nextClips,
          activeClipId: nextActiveClipId,
          clipDrafts: nextClipDrafts,
          assembly: {
            ...snapshot.assembly,
            tracks: nextTracks,
            activeItemId:
              snapshot.assembly.activeItemId && removedItemIds.has(snapshot.assembly.activeItemId)
                ? null
                : snapshot.assembly.activeItemId,
          },
        }
      }),
    )
  }, [])

  const setAssemblyItemMix = useCallback(
    (
      itemId: string,
      patch: {
        volume?: number
        opacity?: number
        muted?: boolean
      },
      options?: {
        recordHistory?: boolean
      },
    ) => {
      setTimelineHistory((previous) =>
        updateTimelineHistory(
          previous,
          (snapshot) => ({
            ...snapshot,
            assembly: {
              ...snapshot.assembly,
              tracks: snapshot.assembly.tracks.map((track) => ({
                ...track,
                items: track.items.map((item) =>
                  item.id === itemId
                    ? {
                        ...item,
                        volume:
                          typeof patch.volume === "number" && Number.isFinite(patch.volume)
                            ? clamp(patch.volume, 0, 2)
                            : item.volume,
                        opacity:
                          typeof patch.opacity === "number" && Number.isFinite(patch.opacity)
                            ? clamp(patch.opacity, 0, 1)
                            : item.opacity,
                        muted: typeof patch.muted === "boolean" ? patch.muted : item.muted,
                      }
                    : item,
                ),
              })),
            },
          }),
          { recordHistory: options?.recordHistory ?? true },
        ),
      )
    },
    [],
  )

  const splitAssemblyItemAtTime = useCallback((itemId: string, timelineTime: number) => {
    if (!Number.isFinite(timelineTime)) {
      return null
    }
    let rightItemId: string | null = null
    setTimelineHistory((previous) =>
      updateTimelineHistory(previous, (snapshot) => {
        const nextTracks = snapshot.assembly.tracks.map((track) => {
          const index = track.items.findIndex((item) => item.id === itemId)
          if (index === -1 || track.locked) {
            return track
          }
          const item = track.items[index]
          const splitPoint = clamp(
            timelineTime,
            item.timelineStart + MIN_ASSEMBLY_ITEM_DURATION_SECONDS,
            item.timelineEnd - MIN_ASSEMBLY_ITEM_DURATION_SECONDS,
          )
          if (
            splitPoint - item.timelineStart < MIN_ASSEMBLY_ITEM_DURATION_SECONDS ||
            item.timelineEnd - splitPoint < MIN_ASSEMBLY_ITEM_DURATION_SECONDS
          ) {
            return track
          }
          const sourceDuration = Math.max(0.0001, item.sourceOut - item.sourceIn)
          const timelineDuration = Math.max(0.0001, item.timelineEnd - item.timelineStart)
          const ratio = sourceDuration / timelineDuration
          const splitSource = clamp(
            item.sourceIn + (splitPoint - item.timelineStart) * ratio,
            item.sourceIn,
            item.sourceOut,
          )
          const leftId = `asm_split_${Math.random().toString(36).slice(2, 8)}`
          const rightId = `asm_split_${Math.random().toString(36).slice(2, 8)}`
          rightItemId = rightId
          const leftItem: ClipAssemblyItem = {
            ...item,
            id: leftId,
            label: `${item.label} · 1`,
            timelineEnd: splitPoint,
            sourceOut: splitSource,
          }
          const rightItem: ClipAssemblyItem = {
            ...item,
            id: rightId,
            label: `${item.label} · 2`,
            timelineStart: splitPoint,
            sourceIn: splitSource,
          }
          return {
            ...track,
            items: [...track.items.slice(0, index), leftItem, rightItem, ...track.items.slice(index + 1)],
          }
        })
        return {
          ...snapshot,
          assembly: {
            ...snapshot.assembly,
            tracks: nextTracks,
            activeItemId: rightItemId ?? snapshot.assembly.activeItemId,
          },
        }
      }),
    )
    return rightItemId
  }, [])

  const trimAssemblyItemToTime = useCallback(
    (itemId: string, edge: "start" | "end", timelineTime: number) => {
      if (!Number.isFinite(timelineTime)) {
        return
      }
      setTimelineHistory((previous) =>
        updateTimelineHistory(previous, (snapshot) => {
          const nextTracks = snapshot.assembly.tracks.map((track) => {
            const index = track.items.findIndex((item) => item.id === itemId)
            if (index === -1 || track.locked) {
              return track
            }
            const item = track.items[index]
            const sourceDuration = Math.max(0.0001, item.sourceOut - item.sourceIn)
            const timelineDuration = Math.max(0.0001, item.timelineEnd - item.timelineStart)
            const ratio = sourceDuration / timelineDuration

            if (edge === "start") {
              const maxStart = item.timelineEnd - MIN_ASSEMBLY_ITEM_DURATION_SECONDS
              const nextStart = clamp(timelineTime, 0, Math.max(0, maxStart))
              if (Math.abs(nextStart - item.timelineStart) < 0.0001) {
                return track
              }
              const delta = nextStart - item.timelineStart
              const nextSourceIn = clamp(item.sourceIn + delta * ratio, 0, item.sourceOut)
              const nextItem: ClipAssemblyItem = {
                ...item,
                timelineStart: nextStart,
                sourceIn: nextSourceIn,
              }
              return {
                ...track,
                items: track.items.map((candidate) => (candidate.id === itemId ? nextItem : candidate)),
              }
            }

            const minEnd = item.timelineStart + MIN_ASSEMBLY_ITEM_DURATION_SECONDS
            const nextEnd = clamp(timelineTime, minEnd, MAX_TIMELINE_DURATION_SECONDS)
            if (Math.abs(nextEnd - item.timelineEnd) < 0.0001) {
              return track
            }
            const nextSourceOut = clamp(
              item.sourceIn + (nextEnd - item.timelineStart) * ratio,
              item.sourceIn,
              MAX_TIMELINE_DURATION_SECONDS,
            )
            const nextItem: ClipAssemblyItem = {
              ...item,
              timelineEnd: nextEnd,
              sourceOut: nextSourceOut,
            }
            return {
              ...track,
              items: track.items.map((candidate) => (candidate.id === itemId ? nextItem : candidate)),
            }
          })
          return {
            ...snapshot,
            assembly: {
              ...snapshot.assembly,
              tracks: nextTracks,
            },
          }
        }),
      )
    },
    [],
  )

  const nudgeAssemblyItem = useCallback((itemId: string, deltaSeconds: number) => {
    if (!Number.isFinite(deltaSeconds) || Math.abs(deltaSeconds) < 0.0001) {
      return
    }
    setTimelineHistory((previous) =>
      updateTimelineHistory(previous, (snapshot) => {
        const nextTracks = snapshot.assembly.tracks.map((track) => {
          const item = track.items.find((candidate) => candidate.id === itemId)
          if (!item || track.locked) {
            return track
          }
          const duration = Math.max(
            MIN_ASSEMBLY_ITEM_DURATION_SECONDS,
            item.timelineEnd - item.timelineStart,
          )
          const nextStart = clamp(
            item.timelineStart + deltaSeconds,
            0,
            Math.max(0, MAX_TIMELINE_DURATION_SECONDS - duration),
          )
          const nextEnd = nextStart + duration
          return {
            ...track,
            items: track.items.map((candidate) =>
              candidate.id === itemId
                ? {
                    ...candidate,
                    timelineStart: nextStart,
                    timelineEnd: nextEnd,
                  }
                : candidate,
            ),
          }
        })
        return {
          ...snapshot,
          assembly: {
            ...snapshot.assembly,
            tracks: nextTracks,
          },
        }
      }),
    )
  }, [])

  const updateActiveSubtitleRenderProfile = useCallback(
    (patch: Partial<SubtitleRenderProfile>) => {
      if (!activeSubtitlePresetId) {
        return
      }
      setSubtitlePresetOptions((previous) =>
        previous.map((preset) =>
          preset.id === activeSubtitlePresetId
            ? {
                ...preset,
                renderProfile: applySubtitleRenderProfilePatch(preset.renderProfile, patch),
              }
            : preset,
        ),
      )
    },
    [activeSubtitlePresetId],
  )

  const createClipFromRange = useCallback(
    (rangeStart: number, rangeEnd: number, title?: string) => {
      const maxDuration = duration > 0 ? duration : Math.max(rangeStart, rangeEnd, 1)
      const start = clamp(Math.min(rangeStart, rangeEnd), 0, maxDuration)
      const end = clamp(Math.max(rangeStart, rangeEnd), 0, maxDuration)
      if (end - start < MIN_CLIP_DURATION_SECONDS) {
        return null
      }

      const clipId = `clip_${Math.random().toString(36).slice(2, 9)}`
      setTimelineHistory((previous) =>
        updateTimelineHistory(previous, (snapshot) => {
          const nextClip: ClipSegment = {
            id: clipId,
            title: title ?? `Clip ${snapshot.clips.length + 1}`,
            start,
            end,
            projectId,
          }
          return {
            ...snapshot,
            clips: [...snapshot.clips, nextClip],
            activeClipId: clipId,
          }
        }),
      )
      return clipId
    },
    [duration, projectId],
  )

  const createClipFromSelection = useCallback(() => {
    if (!derivedTimeSelection) {
      return
    }
    createClipFromRange(derivedTimeSelection.start, derivedTimeSelection.end)
    clearSelection()
  }, [clearSelection, createClipFromRange, derivedTimeSelection])

  const createClipFromTimeRange = useCallback((rangeStart: number, rangeEnd: number) => {
    clearSelection()
    return createClipFromRange(rangeStart, rangeEnd)
  }, [clearSelection, createClipFromRange])

  const removeClip = useCallback((clipId: string) => {
    setTimelineHistory((previous) =>
      updateTimelineHistory(previous, (snapshot) => {
        const next = snapshot.clips.filter((clip) => clip.id !== clipId)
        const removedItemIds = new Set<string>()
        for (const track of snapshot.assembly.tracks) {
          for (const item of track.items) {
            if (item.sourceType === "clip" && item.sourceClipId === clipId) {
              removedItemIds.add(item.id)
            }
          }
        }
        const nextTracks =
          removedItemIds.size > 0
            ? snapshot.assembly.tracks.map((track) => ({
                ...track,
                items: track.items.filter((item) => !removedItemIds.has(item.id)),
              }))
            : snapshot.assembly.tracks
        const remainingDrafts = Object.fromEntries(
          Object.entries(snapshot.clipDrafts).filter(([draftClipId]) => draftClipId !== clipId),
        ) as Record<string, ExportClipDraft>
        return {
          ...snapshot,
          clips: next,
          activeClipId:
            snapshot.activeClipId === clipId ? (next[0]?.id ?? null) : snapshot.activeClipId,
          clipDrafts: remainingDrafts,
          assembly: {
            ...snapshot.assembly,
            tracks: nextTracks,
            activeItemId:
              snapshot.assembly.activeItemId && removedItemIds.has(snapshot.assembly.activeItemId)
                ? null
                : snapshot.assembly.activeItemId,
          },
        }
      }),
    )
  }, [])

  const setClipRange = useCallback(
    (
      clipId: string,
      nextStart: number,
      nextEnd: number,
      options?: {
        recordHistory?: boolean
        rippleMove?: boolean
      },
    ) => {
      if (!Number.isFinite(nextStart) || !Number.isFinite(nextEnd)) {
        return
      }
      const maxTimelineEnd = duration > 0 ? duration : MAX_TIMELINE_DURATION_SECONDS
      const rippleMove = options?.rippleMove ?? false
      setTimelineHistory((previous) =>
        updateTimelineHistory(
          previous,
          (snapshot) => {
            const {
              ordered,
              index,
              target: targetClip,
              previous: previousClip,
            } = resolveClipNeighbors(snapshot.clips, clipId)
            if (!targetClip) {
              return snapshot
            }

            const orderedStart = Math.min(nextStart, nextEnd)
            const orderedEnd = Math.max(nextStart, nextEnd)

            if (rippleMove && index >= 0) {
              const currentLength = Math.max(
                MIN_CLIP_DURATION_SECONDS,
                targetClip.end - targetClip.start,
              )
              const desiredLength = Math.max(
                MIN_CLIP_DURATION_SECONDS,
                orderedEnd - orderedStart,
              )
              const isMoveOperation = Math.abs(desiredLength - currentLength) < 0.0001
              if (isMoveOperation) {
                const affected = ordered.slice(index)
                if (affected.length === 0) {
                  return snapshot
                }
                const minAffectedStart = affected.reduce(
                  (minValue, clip) => Math.min(minValue, clip.start),
                  Number.POSITIVE_INFINITY,
                )
                const maxAffectedEnd = affected.reduce(
                  (maxValue, clip) => Math.max(maxValue, clip.end),
                  Number.NEGATIVE_INFINITY,
                )
                const desiredDelta = orderedStart - targetClip.start
                const minDeltaByPrevious = (previousClip?.end ?? 0) - targetClip.start
                const minDeltaByTimeline = -minAffectedStart
                const maxDeltaByTimeline = maxTimelineEnd - maxAffectedEnd
                const minDelta = Math.max(minDeltaByPrevious, minDeltaByTimeline)
                const maxDelta = maxDeltaByTimeline
                if (minDelta > maxDelta) {
                  return snapshot
                }
                const safeDelta = clamp(desiredDelta, minDelta, maxDelta)
                if (Math.abs(safeDelta) < 0.0001) {
                  return snapshot
                }
                const affectedIds = new Set(affected.map((clip) => clip.id))
                return {
                  ...snapshot,
                  clips: snapshot.clips.map((clip) =>
                    affectedIds.has(clip.id)
                      ? {
                          ...clip,
                          start: clip.start + safeDelta,
                          end: clip.end + safeDelta,
                        }
                      : clip,
                  ),
                  activeClipId: clipId,
                }
              }
            }

            if (maxTimelineEnd < MIN_CLIP_DURATION_SECONDS) {
              return snapshot
            }

            const clampedStart = clamp(
              orderedStart,
              0,
              maxTimelineEnd - MIN_CLIP_DURATION_SECONDS,
            )
            const clampedEnd = clamp(
              orderedEnd,
              clampedStart + MIN_CLIP_DURATION_SECONDS,
              maxTimelineEnd,
            )
            if (
              Math.abs(clampedStart - targetClip.start) < 0.0001 &&
              Math.abs(clampedEnd - targetClip.end) < 0.0001
            ) {
              return snapshot
            }

            return {
              ...snapshot,
              clips: snapshot.clips.map((clip) =>
                clip.id === clipId
                  ? {
                      ...clip,
                      start: clampedStart,
                      end: clampedEnd,
                    }
                  : clip,
              ),
              activeClipId: clipId,
            }
          },
          { recordHistory: options?.recordHistory ?? true },
        ),
      )
    },
    [duration],
  )

  const splitClipAtTime = useCallback((clipId: string, splitTime: number) => {
    let createdRightClipId: string | null = null
    setTimelineHistory((previous) =>
      updateTimelineHistory(previous, (snapshot) => {
        const targetClip = snapshot.clips.find((clip) => clip.id === clipId)
        if (!targetClip) {
          return snapshot
        }
        const safeSplit = clamp(splitTime, targetClip.start, targetClip.end)
        if (
          safeSplit - targetClip.start < MIN_CLIP_DURATION_SECONDS ||
          targetClip.end - safeSplit < MIN_CLIP_DURATION_SECONDS
        ) {
          return snapshot
        }

        const leftClipId = `clip_${Math.random().toString(36).slice(2, 9)}`
        const rightClipId = `clip_${Math.random().toString(36).slice(2, 9)}`
        const leftTitle = `${targetClip.title} · part 1`
        const rightTitle = `${targetClip.title} · part 2`

        const nextClips: ClipSegment[] = []
        for (const clip of snapshot.clips) {
          if (clip.id !== clipId) {
            nextClips.push(clip)
            continue
          }
          nextClips.push({
            ...clip,
            id: leftClipId,
            title: leftTitle,
            end: safeSplit,
          })
          nextClips.push({
            ...clip,
            id: rightClipId,
            title: rightTitle,
            start: safeSplit,
          })
        }

        const sourceDraft = snapshot.clipDrafts[clipId]
        const remainingDrafts = Object.fromEntries(
          Object.entries(snapshot.clipDrafts).filter(([draftClipId]) => draftClipId !== clipId),
        ) as Record<string, ExportClipDraft>

        if (sourceDraft) {
          remainingDrafts[leftClipId] = {
            ...sourceDraft,
            title: sourceDraft.title?.trim().length ? sourceDraft.title : leftTitle,
          }
          remainingDrafts[rightClipId] = {
            ...sourceDraft,
            title: sourceDraft.title?.trim().length ? sourceDraft.title : rightTitle,
          }
        }
        createdRightClipId = rightClipId
        return {
          ...snapshot,
          clips: nextClips,
          activeClipId: rightClipId,
          clipDrafts: remainingDrafts,
        }
      }),
    )
    return createdRightClipId
  }, [])

  const trimClipToTime = useCallback(
    (clipId: string, edge: "start" | "end", time: number) => {
      setTimelineHistory((previous) =>
        updateTimelineHistory(previous, (snapshot) => {
          const targetClip = snapshot.clips.find((clip) => clip.id === clipId)
          if (!targetClip) {
            return snapshot
          }
          const safeTime = clamp(time, 0, MAX_TIMELINE_DURATION_SECONDS)
          const maxTimelineEnd = duration > 0 ? duration : MAX_TIMELINE_DURATION_SECONDS
          const nextClips = snapshot.clips.map((clip) => {
            if (clip.id !== clipId) {
              return clip
            }
            if (edge === "start") {
              const maxStart = clip.end - MIN_CLIP_DURATION_SECONDS
              if (0 > maxStart) {
                return clip
              }
              const nextStart = clamp(
                safeTime,
                0,
                maxStart,
              )
              if (Math.abs(nextStart - clip.start) < 0.0001) {
                return clip
              }
              return {
                ...clip,
                start: nextStart,
              }
            }
            const maxEnd = maxTimelineEnd
            const minEnd = clip.start + MIN_CLIP_DURATION_SECONDS
            if (maxEnd < minEnd) {
              return clip
            }
            const nextEnd = clamp(
              safeTime,
              minEnd,
              maxEnd,
            )
            if (Math.abs(nextEnd - clip.end) < 0.0001) {
              return clip
            }
            return {
              ...clip,
              end: nextEnd,
            }
          })
          return {
            ...snapshot,
            clips: nextClips,
          }
        }),
      )
    },
    [duration],
  )

  const nudgeClip = useCallback(
    (clipId: string, deltaSeconds: number) => {
      if (!Number.isFinite(deltaSeconds) || Math.abs(deltaSeconds) < 0.0001) {
        return
      }
      const maxDuration = duration > 0 ? duration : MAX_TIMELINE_DURATION_SECONDS
      setTimelineHistory((previous) =>
        updateTimelineHistory(previous, (snapshot) => {
          const targetClip = snapshot.clips.find((clip) => clip.id === clipId)
          if (!targetClip) {
            return snapshot
          }
          const clipLength = Math.max(MIN_CLIP_DURATION_SECONDS, targetClip.end - targetClip.start)
          const minStart = 0
          const maxStartByDuration = Math.max(0, maxDuration - clipLength)
          if (maxStartByDuration < minStart) {
            return snapshot
          }
          const maxStart = Math.max(minStart, maxStartByDuration)
          const nextStart = clamp(targetClip.start + deltaSeconds, minStart, maxStart)
          if (Math.abs(nextStart - targetClip.start) < 0.0001) {
            return snapshot
          }
          const nextClips = snapshot.clips.map((clip) => {
            if (clip.id !== clipId) {
              return clip
            }
            return {
              ...clip,
              start: nextStart,
              end: nextStart + clipLength,
            }
          })
          return {
            ...snapshot,
            clips: nextClips,
          }
        }),
      )
    },
    [duration],
  )

  const rippleDeleteClip = useCallback((clipId: string) => {
    let nextActiveClipStartTime = 0
    setTimelineHistory((previous) =>
      updateTimelineHistory(previous, (snapshot) => {
        const orderedClips = sortClipsForTimeline(snapshot.clips)
        const targetIndex = orderedClips.findIndex((clip) => clip.id === clipId)
        const targetClip = targetIndex >= 0 ? orderedClips[targetIndex] : null
        if (!targetClip) {
          return snapshot
        }
        const removedDuration = Math.max(MIN_CLIP_DURATION_SECONDS, targetClip.end - targetClip.start)
        const shiftedClips = orderedClips
          .filter((clip) => clip.id !== clipId)
          .map((clip) => {
            if (clip.start >= targetClip.end) {
              const shiftedStart = clip.start - removedDuration
              const shiftedEnd = clip.end - removedDuration
              const correction = shiftedStart < 0 ? -shiftedStart : 0
              return {
                ...clip,
                start: shiftedStart + correction,
                end: shiftedEnd + correction,
              }
            }
            return clip
          })
        const remainingDrafts = Object.fromEntries(
          Object.entries(snapshot.clipDrafts).filter(([draftClipId]) => draftClipId !== clipId),
        ) as Record<string, ExportClipDraft>
        const nextActiveClip =
          shiftedClips[targetIndex] ?? shiftedClips[targetIndex - 1] ?? shiftedClips[0] ?? null
        nextActiveClipStartTime = nextActiveClip?.start ?? 0
        return {
          ...snapshot,
          clips: shiftedClips,
          activeClipId: nextActiveClip?.id ?? null,
          clipDrafts: remainingDrafts,
        }
      }),
    )
    return nextActiveClipStartTime
  }, [])

  const regenerateHooks = useCallback(() => {
    const wordsSnapshot = words.slice(0, visibleWordCount)
    if (isHooking || wordsSnapshot.length === 0) {
      return
    }
    setIsHooking(true)
    schedule(() => {
      void regenerateHooksViaBackend(projectName, wordsSnapshot)
        .then((hooks) => {
          setHookCandidates(hooks)
        })
        .finally(() => {
          setIsHooking(false)
        })
    }, 620)
  }, [isHooking, projectName, schedule, visibleWordCount, words])

  const regenerateThumbnails = useCallback(() => {
    if (isThumbnailing || duration <= 0) {
      return
    }
    setIsThumbnailing(true)
    schedule(() => {
      void regenerateThumbnailsViaBackend(projectName, duration)
        .then((templates) => {
          const generated = templates.map((template, index) => ({
            ...template,
            focusTime: clamp(template.focusTime + index * 0.8, 0, Math.max(2, duration - 1)),
          }))
          setThumbnailTemplates(generated)
          setActiveThumbnailTemplateId(generated[0]?.id ?? "")
        })
        .finally(() => {
          setIsThumbnailing(false)
        })
    }, 780)
  }, [duration, isThumbnailing, projectName, schedule])

  const updateThumbnailTemplate = useCallback(
    (
      id: string,
      patch: Partial<Pick<ThumbnailTemplate, "overlayTitle" | "overlaySubtitle">>,
    ) => {
      setThumbnailTemplates((previous) =>
        previous.map((template) => (template.id === id ? { ...template, ...patch } : template)),
      )
    },
    [],
  )

  const togglePlatformPreset = useCallback((presetId: string) => {
    setSelectedPlatformPresetIds((previous) =>
      previous.includes(presetId)
        ? previous.filter((id) => id !== presetId)
        : [...previous, presetId],
    )
  }, [])

  const syncCurrentTime = useCallback((time: number) => {
    pendingCurrentTimeRef.current = time
    if (currentTimeRafRef.current) {
      return
    }

    currentTimeRafRef.current = window.requestAnimationFrame(() => {
      currentTimeRafRef.current = null
      const next = pendingCurrentTimeRef.current
      pendingCurrentTimeRef.current = null
      if (next === null) {
        return
      }
      setCurrentTime((previous) => (Math.abs(previous - next) < 0.07 ? previous : next))
    })
  }, [])

  const setDurationWithNormalization = useCallback((nextDuration: number) => {
    const safeDuration = Number.isFinite(nextDuration) ? Math.max(0, nextDuration) : 0
    setDuration(safeDuration)
    if (safeDuration <= 0) {
      return
    }
    setTimelineHistory((previous) =>
      updateTimelineHistory(
        previous,
        (snapshot) => normalizeTimelineSnapshotToDuration(snapshot, safeDuration),
        { recordHistory: false },
      ),
    )
  }, [])

  const exportSessionState = useCallback((): WorkspacePersistedState => {
    const persistedUrl = videoUrl.startsWith("blob:") ? "" : videoUrl
    return {
      version: 1,
      media: {
        videoName,
        videoUrl: persistedUrl,
        duration,
        videoWidth,
        videoHeight,
      },
      transcript: {
        words,
        visibleWordCount,
        transcriptBlocks,
        selection,
        timeSelection: manualTimelineSelection,
      },
      clips,
      activeClipId,
      semanticBlocks,
      ai: {
        viralScore,
        viralInsights,
        hookCandidates,
        contentPlanIdeas,
        seriesSegments,
        subtitlePresets: subtitlePresetOptions,
        platformPresets: platformPresetOptions,
        activeSubtitlePresetId,
        selectedPlatformPresetIds,
        thumbnailTemplates,
        activeThumbnailTemplateId,
        videoAnalysis,
      },
      exportState: {
        clipDrafts: exportClipDrafts,
        assembly,
      },
    }
  }, [
    assembly,
    activeClipId,
    activeSubtitlePresetId,
    activeThumbnailTemplateId,
    clips,
    contentPlanIdeas,
    duration,
    videoHeight,
    videoWidth,
    hookCandidates,
    platformPresetOptions,
    selectedPlatformPresetIds,
    semanticBlocks,
    selection,
    manualTimelineSelection,
    seriesSegments,
    subtitlePresetOptions,
    thumbnailTemplates,
    transcriptBlocks,
    videoName,
    videoAnalysis,
    videoUrl,
    exportClipDrafts,
    viralInsights,
    viralScore,
    visibleWordCount,
    words,
  ])

  const hydrateSessionState = useCallback(
    (state: WorkspacePersistedState) => {
      stopStreaming()
      clearTimers()
      clearVideoAnalysisTimer()
      pendingPipelinePayloadRef.current = null
      videoAnalysisRequestRef.current += 1

      const safeVideoName = state.media?.videoName ?? ""
      const safeVideoUrl = state.media?.videoUrl ?? ""
      const rawDuration = state.media?.duration
      const rawVideoWidth = state.media?.videoWidth
      const rawVideoHeight = state.media?.videoHeight
      const safeDuration =
        typeof rawDuration === "number" && Number.isFinite(rawDuration)
        ? Math.max(0, rawDuration)
        : 0
      const safeVideoWidth =
        typeof rawVideoWidth === "number" && Number.isFinite(rawVideoWidth)
        ? Math.max(0, Math.round(rawVideoWidth))
        : 0
      const safeVideoHeight =
        typeof rawVideoHeight === "number" && Number.isFinite(rawVideoHeight)
        ? Math.max(0, Math.round(rawVideoHeight))
        : 0

      const restoredWords = Array.isArray(state.transcript?.words) ? state.transcript.words : []
      const restoredVisibleWordCount = Math.max(
        0,
        Math.min(state.transcript?.visibleWordCount ?? restoredWords.length, restoredWords.length),
      )
      const restoredTranscriptBlocks = Array.isArray(state.transcript?.transcriptBlocks)
        ? state.transcript.transcriptBlocks
        : []
      const maxSelectableIndex = Math.max(
        0,
        Math.min(restoredVisibleWordCount, restoredWords.length) - 1,
      )
      const restoredSelection = state.transcript?.selection
      const clampedSelection = restoredSelection
        ? {
            start: clamp(restoredSelection.start, 0, maxSelectableIndex),
            end: clamp(restoredSelection.end, 0, maxSelectableIndex),
          }
        : null
      const restoredTimeSelection = state.transcript?.timeSelection
      const maxDuration = safeDuration > 0 ? safeDuration : MAX_TIMELINE_DURATION_SECONDS
      const clampedTimeSelection =
        restoredTimeSelection &&
        Number.isFinite(restoredTimeSelection.start) &&
        Number.isFinite(restoredTimeSelection.end)
          ? {
              start: clamp(
                Math.min(restoredTimeSelection.start, restoredTimeSelection.end),
                0,
                maxDuration,
              ),
              end: clamp(
                Math.max(restoredTimeSelection.start, restoredTimeSelection.end),
                0,
                maxDuration,
              ),
            }
          : null

      setVideoName((current) => safeVideoName || current)
      setVideoUrl((current) => safeVideoUrl || current)
      setDuration((current) => (safeDuration > 0 ? safeDuration : current))
      setVideoWidth((current) => (safeVideoWidth > 0 ? safeVideoWidth : current))
      setVideoHeight((current) => (safeVideoHeight > 0 ? safeVideoHeight : current))
      setWords(restoredWords)
      setVisibleWordCount(restoredVisibleWordCount)
      visibleWordCountRef.current = restoredVisibleWordCount
      setTranscriptBlocks(restoredTranscriptBlocks)
      setSelection(clampedSelection)
      setManualTimelineSelection(
        clampedSelection
          ? null
          : clampedTimeSelection && clampedTimeSelection.end - clampedTimeSelection.start > 0.0001
            ? clampedTimeSelection
            : null,
      )
      selectionAnchorRef.current = clampedSelection?.start ?? null

      setTimelineHistory((previous) =>
        replaceTimelineSnapshot(previous, {
          clips: Array.isArray(state.clips) ? state.clips : [],
          activeClipId: state.activeClipId ?? null,
          clipDrafts: state.exportState?.clipDrafts ?? {},
          assembly: state.exportState?.assembly ?? buildAssemblyFromClips(Array.isArray(state.clips) ? state.clips : []),
        }),
      )
      setSemanticBlocks(Array.isArray(state.semanticBlocks) ? state.semanticBlocks : [])

      setViralScore(state.ai?.viralScore ?? null)
      setViralInsights(Array.isArray(state.ai?.viralInsights) ? state.ai.viralInsights : [])
      setHookCandidates(Array.isArray(state.ai?.hookCandidates) ? state.ai.hookCandidates : [])
      setContentPlanIdeas(Array.isArray(state.ai?.contentPlanIdeas) ? state.ai.contentPlanIdeas : [])
      setSeriesSegments(Array.isArray(state.ai?.seriesSegments) ? state.ai.seriesSegments : [])

      const restoredSubtitlePresets = normalizeSubtitlePresetCollection(state.ai?.subtitlePresets)
      const restoredPlatformPresets = Array.isArray(state.ai?.platformPresets)
        ? state.ai.platformPresets
        : platformPresets
      setSubtitlePresetOptions(restoredSubtitlePresets)
      setPlatformPresetOptions(restoredPlatformPresets)
      setActiveSubtitlePresetId(
        state.ai?.activeSubtitlePresetId || restoredSubtitlePresets[0]?.id || "",
      )
      setSelectedPlatformPresetIds(
        state.ai?.selectedPlatformPresetIds?.length
          ? state.ai.selectedPlatformPresetIds
          : restoredPlatformPresets.slice(0, 2).map((preset) => preset.id),
      )

      const restoredTemplates = Array.isArray(state.ai?.thumbnailTemplates)
        ? state.ai.thumbnailTemplates
        : []
      setThumbnailTemplates(restoredTemplates)
      setActiveThumbnailTemplateId(
        state.ai?.activeThumbnailTemplateId || restoredTemplates[0]?.id || "",
      )
      setVideoAnalysis(normalizeVideoAnalysisReport(state.ai?.videoAnalysis))

      setIsAnalyzingVideo(false)
      setIsTranscribing(false)
      setIsScoring(false)
      setIsHooking(false)
      setIsPlanning(false)
      setIsSegmenting(false)
      setIsThumbnailing(false)
    },
    [buildAssemblyFromClips, clearTimers, clearVideoAnalysisTimer, stopStreaming],
  )

  useEffect(() => {
    visibleWordCountRef.current = visibleWordCount
  }, [visibleWordCount])

  useEffect(() => {
    return () => {
      stopStreaming()
      clearObjectUrl()
      clearTimers()
      clearVideoAnalysisTimer()
      flushCurrentTime()
    }
  }, [clearObjectUrl, clearTimers, clearVideoAnalysisTimer, flushCurrentTime, stopStreaming])

  return {
    media: {
      videoName,
      videoUrl,
      duration,
      currentTime,
      videoWidth,
      videoHeight,
    },
    transcript: {
      words,
      visibleWords,
      visibleWordCount,
      transcriptBlocks,
      visibleTranscriptBlocks,
      activeTranscriptBlockId,
      activeWordIndex,
      isTranscribing,
      selection,
      derivedTimeSelection,
    },
    clips,
    activeClipId,
    timeline: {
      canUndo: canUndoTimeline,
      canRedo: canRedoTimeline,
      revision: timelineHistory.revision,
    },
    semanticBlocks,
    assembly: {
      tracks: assemblyTracks,
      activeTrackId: activeAssemblyTrackId,
      activeItemId: activeAssemblyItemId,
      zoom: assemblyZoom,
      subtitleOverlaysEnabled: assemblySubtitleOverlaysEnabled,
    },
    exports: {
      clipDrafts: exportClipDrafts,
    },
    ai: {
      isAnalyzingVideo,
      isScoring,
      isHooking,
      isPlanning,
      isSegmenting,
      isThumbnailing,
      videoAnalysis,
      viralScore,
      viralInsights,
      hookCandidates,
      contentPlanIdeas,
      seriesSegments,
      subtitlePresets: subtitlePresetOptions,
      activeSubtitlePresetId,
      activeSubtitlePreset,
      platformPresets: platformPresetOptions,
      selectedPlatformPresetIds,
      selectedPlatformPresets,
      thumbnailTemplates,
      activeThumbnailTemplateId,
      isAnyProcessing,
    },
    actions: {
      setUploadedVideo,
      setImportedVideoPath,
      setDuration: setDurationWithNormalization,
      setCurrentTime,
      syncCurrentTime,
      startTranscription,
      startMockTranscription,
      selectWord,
      setSelectionRange,
      clearSelection,
      applyTimelineRange,
      createClipFromSelection,
      createClipFromTimeRange,
      setActiveClipId,
      undoTimeline,
      redoTimeline,
      removeClip,
      setClipRange,
      splitClipAtTime,
      trimClipToTime,
      nudgeClip,
      rippleDeleteClip,
      regenerateHooks,
      regenerateThumbnails,
      setActiveSubtitlePresetId,
      updateActiveSubtitleRenderProfile,
      togglePlatformPreset,
      setActiveThumbnailTemplateId,
      updateThumbnailTemplate,
      setExportClipDrafts,
      setActiveAssemblyTrackId,
      setActiveAssemblyItemId,
      setAssemblyZoom,
      setAssemblySubtitleOverlaysEnabled,
      resetAssemblyFromClips,
      addAssemblyTrack,
      removeAssemblyTrack,
      renameAssemblyTrack,
      toggleAssemblyTrackMuted,
      toggleAssemblyTrackLocked,
      toggleAssemblyTrackHidden,
      appendClipToAssemblyTrack,
      appendExternalMediaToAssemblyTrack,
      setAssemblyItemRange,
      moveAssemblyItemToNewVideoTrackAbove,
      removeAssemblyItem,
      setAssemblyItemMix,
      splitAssemblyItemAtTime,
      trimAssemblyItemToTime,
      nudgeAssemblyItem,
      exportSessionState,
      hydrateSessionState,
    },
  }
}
