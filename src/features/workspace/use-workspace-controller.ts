import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { convertFileSrc } from "@tauri-apps/api/core"

import type {
  ClipSegment,
  ContentPlanIdea,
  ExportClipDraft,
  HookCandidate,
  PlatformPreset,
  SemanticBlock,
  SeriesSegment,
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

const defaultPlatformSelection = ["pf_tiktok", "pf_shorts"]

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

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
  const currentTimeRafRef = useRef<number | null>(null)
  const pendingCurrentTimeRef = useRef<number | null>(null)
  const selectionAnchorRef = useRef<number | null>(null)
  const transcriptionRequestRef = useRef(0)
  const objectUrlRef = useRef<string | null>(null)
  const scheduledTimersRef = useRef<number[]>([])
  const pipelineStartedRef = useRef(false)
  const pendingPipelinePayloadRef = useRef<WorkspaceMockPayload | null>(null)
  const visibleWordCountRef = useRef(0)

  const [videoName, setVideoName] = useState("")
  const [videoUrl, setVideoUrl] = useState("")
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)

  const [words, setWords] = useState<TranscriptWord[]>([])
  const [visibleWordCount, setVisibleWordCount] = useState(0)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [transcriptBlocks, setTranscriptBlocks] = useState<TranscriptSemanticBlock[]>([])

  const [selection, setSelection] = useState<WordRange | null>(null)
  const [clips, setClips] = useState<ClipSegment[]>([])
  const [activeClipId, setActiveClipId] = useState<string | null>(null)

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
  const [exportClipDrafts, setExportClipDrafts] = useState<Record<string, ExportClipDraft>>({})

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
      return null
    }
    const startWord = words[selection.start]
    const endWord = words[selection.end]
    if (!startWord || !endWord) {
      return null
    }
    return { start: startWord.start, end: endWord.end }
  }, [selection, words])

  const activeSubtitlePreset = useMemo<SubtitlePreset | undefined>(
    () => subtitlePresetOptions.find((preset) => preset.id === activeSubtitlePresetId),
    [activeSubtitlePresetId, subtitlePresetOptions],
  )

  const selectedPlatformPresets = useMemo<PlatformPreset[]>(
    () => platformPresetOptions.filter((preset) => selectedPlatformPresetIds.includes(preset.id)),
    [platformPresetOptions, selectedPlatformPresetIds],
  )

  const isAnyProcessing =
    isTranscribing || isScoring || isHooking || isPlanning || isSegmenting || isThumbnailing

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

  const resetDerivedStates = useCallback(() => {
    setSelection(null)
    selectionAnchorRef.current = null
    setClips([])
    setActiveClipId(null)
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
    setExportClipDrafts({})
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
      setSubtitlePresetOptions(payload.subtitlePresets)
      setPlatformPresetOptions(payload.platformPresets)
      setActiveSubtitlePresetId(
        payload.activeSubtitlePresetId || payload.subtitlePresets[0]?.id || "",
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
      pendingPipelinePayloadRef.current = null

      const objectUrl = URL.createObjectURL(file)
      objectUrlRef.current = objectUrl

      setVideoUrl(objectUrl)
      setVideoName(file.name)
      setDuration(0)
      setCurrentTime(0)
      setWords([])
      setTranscriptBlocks([])
      setSemanticBlocks([])
      setVisibleWordCount(0)
      visibleWordCountRef.current = 0
      setIsTranscribing(false)
      resetDerivedStates()

      const metadataProbe = document.createElement("video")
      metadataProbe.preload = "metadata"
      metadataProbe.src = objectUrl
      metadataProbe.onloadedmetadata = () => {
        const detectedDuration = metadataProbe.duration || 0
        setDuration(detectedDuration)
        void startMockTranscription(detectedDuration || 120)
      }
    },
    [clearObjectUrl, clearTimers, resetDerivedStates, startMockTranscription, stopStreaming],
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
      pendingPipelinePayloadRef.current = null
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
      const fileName = trimmedPath.split(/[\\/]/).pop() || "Импортированное видео"

      setVideoUrl(sourceUrl)
      setVideoName(fileName)
      if (!preserveWorkspaceState) {
        setDuration(0)
        setCurrentTime(0)
        setWords([])
        setTranscriptBlocks([])
        setSemanticBlocks([])
        setVisibleWordCount(0)
        visibleWordCountRef.current = 0
        setIsTranscribing(false)
        resetDerivedStates()
      }

      const metadataProbe = document.createElement("video")
      metadataProbe.preload = "metadata"
      metadataProbe.src = sourceUrl
      metadataProbe.onloadedmetadata = () => {
        const detectedDuration = metadataProbe.duration || 0
        if (detectedDuration > 0) {
          setDuration((current) =>
            preserveWorkspaceState && current > 0 ? current : detectedDuration,
          )
        }
        if (!preserveWorkspaceState) {
          void startMockTranscription(detectedDuration || 120)
        }
      }
    },
    [clearObjectUrl, clearTimers, resetDerivedStates, startMockTranscription, stopStreaming],
  )

  const clearSelection = useCallback(() => {
    setSelection(null)
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
    selectionAnchorRef.current = boundedStart
  }, [visibleWordCount, words.length])

  const selectWord = useCallback((index: number, extendSelection = false) => {
    if (words.length === 0 || visibleWordCount <= 0) {
      return
    }
    const maxSelectableIndex = Math.max(0, Math.min(words.length, visibleWordCount) - 1)
    const boundedIndex = clamp(index, 0, maxSelectableIndex)
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
        clearSelection()
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
      selectionAnchorRef.current = startIndex
    },
    [clearSelection, visibleWordCount, words],
  )

  const createClipFromRange = useCallback(
    (rangeStart: number, rangeEnd: number, title?: string) => {
      const maxDuration = duration > 0 ? duration : Math.max(rangeStart, rangeEnd, 1)
      const start = clamp(Math.min(rangeStart, rangeEnd), 0, maxDuration)
      const end = clamp(Math.max(rangeStart, rangeEnd), 0, maxDuration)
      if (end - start < 0.35) {
        return null
      }

      const clipId = `clip_${Math.random().toString(36).slice(2, 9)}`
      setClips((previous) => {
        const nextClip: ClipSegment = {
          id: clipId,
          title: title ?? `Клип ${previous.length + 1}`,
          start,
          end,
          projectId,
        }
        return [...previous, nextClip]
      })
      setActiveClipId(clipId)
      return clipId
    },
    [duration, projectId],
  )

  const createClipFromSelection = useCallback(() => {
    if (!selection) {
      return
    }
    const startWord = words[selection.start]
    const endWord = words[selection.end]
    if (!startWord || !endWord) {
      return
    }
    createClipFromRange(startWord.start, endWord.end)
    clearSelection()
  }, [clearSelection, createClipFromRange, selection, words])

  const createClipFromTimeRange = useCallback((rangeStart: number, rangeEnd: number) => {
    clearSelection()
    return createClipFromRange(rangeStart, rangeEnd)
  }, [clearSelection, createClipFromRange])

  const removeClip = useCallback((clipId: string) => {
    setClips((previous) => {
      const next = previous.filter((clip) => clip.id !== clipId)
      setActiveClipId((current) => {
        if (current !== clipId) {
          return current
        }
        return next[0]?.id ?? null
      })
      return next
    })
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

  const exportSessionState = useCallback((): WorkspacePersistedState => {
    const persistedUrl = videoUrl.startsWith("blob:") ? "" : videoUrl
    return {
      version: 1,
      media: {
        videoName,
        videoUrl: persistedUrl,
        duration,
      },
      transcript: {
        words,
        visibleWordCount,
        transcriptBlocks,
        selection,
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
      },
      exportState: {
        clipDrafts: exportClipDrafts,
      },
    }
  }, [
    activeClipId,
    activeSubtitlePresetId,
    activeThumbnailTemplateId,
    clips,
    contentPlanIdeas,
    duration,
    hookCandidates,
    platformPresetOptions,
    selectedPlatformPresetIds,
    semanticBlocks,
    selection,
    seriesSegments,
    subtitlePresetOptions,
    thumbnailTemplates,
    transcriptBlocks,
    videoName,
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
      pendingPipelinePayloadRef.current = null

      const safeVideoName = state.media?.videoName ?? ""
      const safeVideoUrl = state.media?.videoUrl ?? ""
      const safeDuration = Number.isFinite(state.media?.duration)
        ? Math.max(0, state.media.duration)
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

      setVideoName((current) => safeVideoName || current)
      setVideoUrl((current) => safeVideoUrl || current)
      setDuration((current) => (safeDuration > 0 ? safeDuration : current))
      setWords(restoredWords)
      setVisibleWordCount(restoredVisibleWordCount)
      visibleWordCountRef.current = restoredVisibleWordCount
      setTranscriptBlocks(restoredTranscriptBlocks)
      setSelection(clampedSelection)
      selectionAnchorRef.current = clampedSelection?.start ?? null

      setClips(Array.isArray(state.clips) ? state.clips : [])
      setActiveClipId(state.activeClipId ?? null)
      setSemanticBlocks(Array.isArray(state.semanticBlocks) ? state.semanticBlocks : [])

      setViralScore(state.ai?.viralScore ?? null)
      setViralInsights(Array.isArray(state.ai?.viralInsights) ? state.ai.viralInsights : [])
      setHookCandidates(Array.isArray(state.ai?.hookCandidates) ? state.ai.hookCandidates : [])
      setContentPlanIdeas(Array.isArray(state.ai?.contentPlanIdeas) ? state.ai.contentPlanIdeas : [])
      setSeriesSegments(Array.isArray(state.ai?.seriesSegments) ? state.ai.seriesSegments : [])

      const restoredSubtitlePresets = Array.isArray(state.ai?.subtitlePresets)
        ? state.ai.subtitlePresets
        : subtitlePresets
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
      setExportClipDrafts(state.exportState?.clipDrafts ?? {})

      setIsTranscribing(false)
      setIsScoring(false)
      setIsHooking(false)
      setIsPlanning(false)
      setIsSegmenting(false)
      setIsThumbnailing(false)
    },
    [clearTimers, stopStreaming],
  )

  useEffect(() => {
    visibleWordCountRef.current = visibleWordCount
  }, [visibleWordCount])

  useEffect(() => {
    return () => {
      stopStreaming()
      clearObjectUrl()
      clearTimers()
      flushCurrentTime()
    }
  }, [clearObjectUrl, clearTimers, flushCurrentTime, stopStreaming])

  return {
    media: {
      videoName,
      videoUrl,
      duration,
      currentTime,
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
    semanticBlocks,
    exports: {
      clipDrafts: exportClipDrafts,
    },
    ai: {
      isScoring,
      isHooking,
      isPlanning,
      isSegmenting,
      isThumbnailing,
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
      setDuration,
      setCurrentTime,
      syncCurrentTime,
      startMockTranscription,
      selectWord,
      setSelectionRange,
      clearSelection,
      applyTimelineRange,
      createClipFromSelection,
      createClipFromTimeRange,
      setActiveClipId,
      removeClip,
      regenerateHooks,
      regenerateThumbnails,
      setActiveSubtitlePresetId,
      togglePlatformPreset,
      setActiveThumbnailTemplateId,
      updateThumbnailTemplate,
      setExportClipDrafts,
      exportSessionState,
      hydrateSessionState,
    },
  }
}
