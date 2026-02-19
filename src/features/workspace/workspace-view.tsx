import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  ArrowLeftIcon,
  FolderOpenIcon,
  Settings2Icon,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import type { Project } from "@/app/types"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import ClipsContextPanel from "@/features/workspace/context/clips-context-panel"
import ExportContextPanel from "@/features/workspace/context/export-context-panel"
import InsightsContextPanel from "@/features/workspace/context/insights-context-panel"
import ThumbnailsContextPanel from "@/features/workspace/context/thumbnails-context-panel"
import VideoContextPanel from "@/features/workspace/context/video-context-panel"
import { ModeRail } from "@/features/workspace/mode-rail"
import ClipsMode from "@/features/workspace/modes/clips-mode"
import ExportMode from "@/features/workspace/modes/export-mode"
import InsightsMode from "@/features/workspace/modes/insights-mode"
import ThumbnailsMode from "@/features/workspace/modes/thumbnails-mode"
import VideoMode from "@/features/workspace/modes/video-mode"
import { workspaceMotion } from "@/features/workspace/motion"
import { useWorkspaceController } from "@/features/workspace/use-workspace-controller"
import { type WorkspaceMode } from "@/features/workspace/workspace-modes"
import { AmbientBackground } from "@/shared/react-bits/ambient-background"
import { ShinyText } from "@/shared/react-bits/shiny-text"
import { useAppToast } from "@/shared/ui/app-toast-provider"
import {
  loadProjectResumeState,
  loadProjectWorkspaceState,
  openPathInFileManager,
  openProjectsRootDir,
  pickLocalVideoFile,
  probeYoutubeFormats,
  type ProjectResumeState,
  saveProjectResumeState,
  saveProjectWorkspaceState,
  stageLocalVideoFile,
  type WorkspacePersistedState,
} from "@/shared/tauri/backend"
import { isTauriRuntime } from "@/shared/tauri/runtime"

type WorkspaceViewProps = {
  project: Project
  initialMode?: WorkspaceMode | null
  onBack: () => void
  onOpenSettings: () => void
  onProjectPatch?: (projectId: string, patch: Partial<Project>) => void
}

function isWorkspaceMode(value: string): value is WorkspaceMode {
  return value === "video" || value === "clips" || value === "export" || value === "insights" || value === "thumbnails"
}

function hasMeaningfulWorkspaceState(
  state: WorkspacePersistedState,
  sourceType: Project["sourceType"],
  sourceUrl: Project["sourceUrl"],
): boolean {
  const restoredVideoUrl = state.media?.videoUrl?.trim() ?? ""
  const hasTranscript = Array.isArray(state.transcript?.words) && state.transcript.words.length > 0
  const hasSemantic = Array.isArray(state.semanticBlocks) && state.semanticBlocks.length > 0
  const hasClips = Array.isArray(state.clips) && state.clips.length > 0
  const hasVideoAnalysis = Boolean(state.ai?.videoAnalysis)
  const isStaleYoutubeSourceUrl =
    sourceType === "youtube" &&
    typeof sourceUrl === "string" &&
    sourceUrl.trim().length > 0 &&
    restoredVideoUrl.length > 0 &&
    restoredVideoUrl === sourceUrl

  if (isStaleYoutubeSourceUrl) {
    return hasTranscript || hasSemantic || hasClips || hasVideoAnalysis
  }
  if (hasTranscript || hasSemantic || hasClips || hasVideoAnalysis) {
    return true
  }
  // A bare videoUrl without derived workspace data should not block re-bootstrap.
  // Otherwise project opens with media but no transcript/clips and never restarts processing.
  if (restoredVideoUrl.length > 0) {
    return false
  }
  return false
}

function resolveErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }
  if (typeof error === "string" && error.trim()) {
    return error
  }
  if (error && typeof error === "object" && "message" in error) {
    const candidate = (error as { message?: unknown }).message
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate
    }
  }
  return fallback
}

function normalizeOptionalMetric(value?: number | null): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined
  }
  return Math.max(0, Math.round(value))
}

export function WorkspaceView({
  project,
  initialMode = null,
  onBack,
  onOpenSettings,
  onProjectPatch,
}: WorkspaceViewProps) {
  const { t } = useTranslation()
  const controller = useWorkspaceController(project.id, project.name)
  const { pushToast } = useAppToast()
  const [activeMode, setActiveMode] = useState<WorkspaceMode>(initialMode ?? "video")
  const [hydrationResolved, setHydrationResolved] = useState(false)
  const setImportedVideoPath = controller.actions.setImportedVideoPath
  const hydrateSessionState = controller.actions.hydrateSessionState
  const exportSessionState = controller.actions.exportSessionState
  const setCurrentTime = controller.actions.setCurrentTime
  const setActiveClipId = controller.actions.setActiveClipId

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const resumeSeekRef = useRef<number | null>(null)
  const manualModeChangeRef = useRef(false)
  const lastWorkspaceSnapshotRef = useRef("")
  const lastResumeSnapshotRef = useRef("")
  const hasHydratedWorkspaceStateRef = useRef(false)
  const pendingWorkspaceSnapshotRef = useRef<string | null>(null)
  const pendingWorkspacePayloadRef = useRef<WorkspacePersistedState | null>(null)
  const pendingResumeSnapshotRef = useRef<string | null>(null)
  const pendingResumePayloadRef = useRef<
    Pick<ProjectResumeState, "activeMode" | "currentTime" | "activeClipId"> | null
  >(null)
  const persistErrorReportedAtRef = useRef(0)
  const flushPersistenceRef = useRef<(() => void) | null>(null)
  const lastProjectMetricsSnapshotRef = useRef("")
  const youtubeMetricsRefreshKeyRef = useRef("")

  const openFilePicker = useCallback(() => {
    if (isTauriRuntime()) {
      void (async () => {
        try {
          const selectedPath = await pickLocalVideoFile()
          if (!selectedPath) {
            return
          }
          let resolvedPath = selectedPath
          try {
            resolvedPath = await stageLocalVideoFile(selectedPath, project.name)
          } catch (stageError) {
            pushToast({
              title: t("workspaceView.usingOriginalFileTitle"),
              description: resolveErrorMessage(
                stageError,
                t("workspaceView.usingOriginalFileDescription"),
              ),
              tone: "info",
              durationMs: 3200,
            })
          }
          setImportedVideoPath(resolvedPath)
          setActiveMode("video")
          onProjectPatch?.(project.id, {
            sourceType: "local",
            sourceLabel: resolvedPath.split(/[\\/]/).pop() || t("workspaceView.localFileFallback"),
            sourceUrl: resolvedPath,
            sourceStatus: "ready",
            importedMediaPath: resolvedPath,
          })
        } catch (error) {
          pushToast({
            title: t("workspaceView.videoLoadFailedTitle"),
            description: resolveErrorMessage(error, t("workspaceView.videoLoadFailedDescription")),
            tone: "error",
            durationMs: 3600,
          })
        }
      })()
      return
    }
    fileInputRef.current?.click()
  }, [onProjectPatch, project.id, project.name, pushToast, setImportedVideoPath, t])

  const resolvedProjectSourceCandidate = useMemo(() => {
    const importedPath = project.importedMediaPath?.trim()
    if (importedPath) {
      return importedPath
    }
    if (project.sourceType === "local") {
      const sourceUrl = project.sourceUrl?.trim()
      if (sourceUrl) {
        return sourceUrl
      }
    }
    return null
  }, [project.importedMediaPath, project.sourceType, project.sourceUrl])
  const hasStaleYoutubeSourceUrl =
    project.sourceType === "youtube" &&
    Boolean(project.sourceUrl) &&
    controller.media.videoUrl === project.sourceUrl
  const isMediaBootstrapPending =
    hydrationResolved &&
    Boolean(resolvedProjectSourceCandidate) &&
    (!controller.media.videoUrl || hasStaleYoutubeSourceUrl)

  const handleModeChange = useCallback((mode: WorkspaceMode) => {
    if (!hydrationResolved || isMediaBootstrapPending) {
      return
    }
    if (mode === activeMode) {
      return
    }
    manualModeChangeRef.current = true
    setActiveMode(mode)
  }, [activeMode, hydrationResolved, isMediaBootstrapPending])

  const modeContent = useMemo(() => {
    if (!hydrationResolved || isMediaBootstrapPending) {
      return (
        <div className="grid h-full min-h-[420px] place-content-center rounded-xl border border-white/10 bg-black/24 px-4 text-center">
          <div className="space-y-1.5">
            <ShinyText
              text={hydrationResolved ? t("workspaceView.connectingProjectMedia") : t("workspaceView.restoringProject")}
              speed={2.1}
              className="text-sm text-zinc-200"
            />
            <p className="text-xs text-zinc-500">
              {hydrationResolved
                ? t("workspaceView.connectingProjectMediaDescription")
                : t("workspaceView.restoringProjectDescription")}
            </p>
          </div>
        </div>
      )
    }
    if (activeMode === "video") {
      return <VideoMode controller={controller} videoRef={videoRef} onOpenFilePicker={openFilePicker} />
    }
    if (activeMode === "clips") {
      return <ClipsMode controller={controller} videoRef={videoRef} />
    }
    if (activeMode === "export") {
      return (
        <ExportMode
          controller={controller}
          projectId={project.id}
          projectName={project.name}
          sourcePath={resolvedProjectSourceCandidate}
          onOpenCoverMode={() => handleModeChange("thumbnails")}
        />
      )
    }
    if (activeMode === "insights") {
      return <InsightsMode controller={controller} project={project} />
    }
    return <ThumbnailsMode controller={controller} />
  }, [
    activeMode,
    controller,
    handleModeChange,
    hydrationResolved,
    isMediaBootstrapPending,
    openFilePicker,
    project,
    resolvedProjectSourceCandidate,
    t,
  ])

  const contextContent = useMemo(() => {
    if (!hydrationResolved || isMediaBootstrapPending) {
      return (
        <div className="rounded-xl border border-white/10 bg-black/24 px-3 py-3">
          <p className="text-xs text-zinc-400">{t("workspaceView.systemContextTitle")}</p>
          <p className="mt-1 text-xs text-zinc-500">
            {hydrationResolved
              ? t("workspaceView.systemContextConnecting")
              : t("workspaceView.systemContextRestoring")}
          </p>
        </div>
      )
    }
    if (activeMode === "video") {
      return (
        <VideoContextPanel
          controller={controller}
          onOpenFilePicker={openFilePicker}
          onSeekToTime={(time) => {
            const player = videoRef.current
            if (player) {
              player.currentTime = time
            }
            controller.actions.setCurrentTime(time)
          }}
        />
      )
    }
    if (activeMode === "clips") {
      return (
        <ClipsContextPanel
          controller={controller}
          onOpenExportMode={() => handleModeChange("export")}
        />
      )
    }
    if (activeMode === "export") {
      return <ExportContextPanel controller={controller} />
    }
    if (activeMode === "insights") {
      return <InsightsContextPanel controller={controller} project={project} />
    }
    return <ThumbnailsContextPanel controller={controller} />
  }, [
    activeMode,
    controller,
    handleModeChange,
    hydrationResolved,
    isMediaBootstrapPending,
    openFilePicker,
    project,
    t,
  ])

  useEffect(() => {
    let cancelled = false

    void Promise.all([
      loadProjectWorkspaceState(project.id),
      loadProjectResumeState(project.id),
    ])
      .then(([workspaceState, resumeState]) => {
        if (cancelled) {
          return
        }

        const hasWorkspaceState = workspaceState?.version === 1
        const shouldHydrateWorkspaceState =
          hasWorkspaceState &&
          hasMeaningfulWorkspaceState(workspaceState, project.sourceType, project.sourceUrl)
        hasHydratedWorkspaceStateRef.current = shouldHydrateWorkspaceState
        if (shouldHydrateWorkspaceState) {
          hydrateSessionState(workspaceState)
          lastWorkspaceSnapshotRef.current = JSON.stringify(workspaceState)
          pendingWorkspaceSnapshotRef.current = null
          pendingWorkspacePayloadRef.current = null
        } else {
          lastWorkspaceSnapshotRef.current = ""
          pendingWorkspaceSnapshotRef.current = null
          pendingWorkspacePayloadRef.current = null
        }

        if (resumeState) {
          const normalizedResumeTime = Number(resumeState.currentTime.toFixed(1))
          const resumeSnapshot = `${resumeState.activeMode}|${normalizedResumeTime}|${resumeState.activeClipId ?? ""}`
          lastResumeSnapshotRef.current = resumeSnapshot
          pendingResumeSnapshotRef.current = null
          pendingResumePayloadRef.current = null

          if (!initialMode && !manualModeChangeRef.current && isWorkspaceMode(resumeState.activeMode)) {
            setActiveMode(resumeState.activeMode)
          }
          if (resumeState.activeClipId) {
            setActiveClipId(resumeState.activeClipId)
          }
          if (Number.isFinite(normalizedResumeTime) && normalizedResumeTime > 0) {
            resumeSeekRef.current = normalizedResumeTime
            setCurrentTime(normalizedResumeTime)
          }
        }
      })
      .catch((error) => {
        console.error("Failed to hydrate workspace session:", error)
      })
      .finally(() => {
        if (!cancelled) {
          setHydrationResolved(true)
        }
      })

    return () => {
      cancelled = true
    }
  }, [
    hydrateSessionState,
    initialMode,
    project.id,
    project.sourceType,
    project.sourceUrl,
    setActiveClipId,
    setCurrentTime,
  ])

  useEffect(() => {
    if (!hydrationResolved) {
      return
    }
    const sourceCandidate = resolvedProjectSourceCandidate
    if (!sourceCandidate) {
      return
    }
    if (controller.media.videoUrl && !hasStaleYoutubeSourceUrl) {
      return
    }
    setImportedVideoPath(sourceCandidate, {
      preserveWorkspaceState: hasHydratedWorkspaceStateRef.current,
    })
  }, [
    controller.media.videoUrl,
    hasStaleYoutubeSourceUrl,
    hydrationResolved,
    resolvedProjectSourceCandidate,
    setImportedVideoPath,
  ])

  useEffect(() => {
    if (!hydrationResolved || !onProjectPatch || project.sourceType !== "youtube") {
      return
    }

    const sourceUrl = project.sourceUrl?.trim()
    if (!sourceUrl) {
      return
    }

    const refreshKey = `${project.id}|${sourceUrl}`
    if (youtubeMetricsRefreshKeyRef.current === refreshKey) {
      return
    }
    youtubeMetricsRefreshKeyRef.current = refreshKey

    let cancelled = false
    void probeYoutubeFormats(sourceUrl)
      .then((payload) => {
        if (cancelled) {
          return
        }
        const nextViewCount = normalizeOptionalMetric(payload.viewCount)
        const nextLikeCount = normalizeOptionalMetric(payload.likeCount)
        const nextCommentCount = normalizeOptionalMetric(payload.commentCount)
        const nextFollowers = normalizeOptionalMetric(payload.channelFollowers)
        const nextDuration = normalizeOptionalMetric(payload.duration)

        const patch: Partial<Project> = {
          sourceMetricsUpdatedAt: new Date().toISOString(),
        }

        if (payload.title?.trim()) {
          patch.sourceLabel = payload.title.trim()
        }
        if (payload.uploader?.trim()) {
          patch.sourceUploader = payload.uploader.trim()
        }
        if (payload.thumbnail?.trim()) {
          patch.sourceThumbnail = payload.thumbnail.trim()
        }
        if (payload.uploadDate?.trim()) {
          patch.sourceUploadDate = payload.uploadDate.trim()
        }
        if (payload.channelId?.trim()) {
          patch.sourceChannelId = payload.channelId.trim()
        }
        if (payload.channelUrl?.trim()) {
          patch.sourceChannelUrl = payload.channelUrl.trim()
        }
        if (nextDuration !== undefined) {
          patch.sourceDurationSeconds = nextDuration
        }

        if (nextViewCount !== undefined) {
          patch.sourceViewCount = nextViewCount
          if (
            typeof project.sourceViewCount === "number" &&
            Number.isFinite(project.sourceViewCount) &&
            nextViewCount !== Math.max(0, Math.round(project.sourceViewCount))
          ) {
            patch.sourceViewCountPrevious = Math.max(0, Math.round(project.sourceViewCount))
          }
        }
        if (nextLikeCount !== undefined) {
          patch.sourceLikeCount = nextLikeCount
          if (
            typeof project.sourceLikeCount === "number" &&
            Number.isFinite(project.sourceLikeCount) &&
            nextLikeCount !== Math.max(0, Math.round(project.sourceLikeCount))
          ) {
            patch.sourceLikeCountPrevious = Math.max(0, Math.round(project.sourceLikeCount))
          }
        }
        if (nextCommentCount !== undefined) {
          patch.sourceCommentCount = nextCommentCount
          if (
            typeof project.sourceCommentCount === "number" &&
            Number.isFinite(project.sourceCommentCount) &&
            nextCommentCount !== Math.max(0, Math.round(project.sourceCommentCount))
          ) {
            patch.sourceCommentCountPrevious = Math.max(0, Math.round(project.sourceCommentCount))
          }
        }
        if (nextFollowers !== undefined) {
          patch.sourceChannelFollowers = nextFollowers
          if (
            typeof project.sourceChannelFollowers === "number" &&
            Number.isFinite(project.sourceChannelFollowers) &&
            nextFollowers !== Math.max(0, Math.round(project.sourceChannelFollowers))
          ) {
            patch.sourceChannelFollowersPrevious = Math.max(
              0,
              Math.round(project.sourceChannelFollowers),
            )
          }
        }

        onProjectPatch(project.id, patch)
      })
      .catch((error) => {
        if (!cancelled) {
          console.error("Failed to refresh YouTube source metrics:", error)
        }
      })

    return () => {
      cancelled = true
    }
  }, [
    hydrationResolved,
    onProjectPatch,
    project.id,
    project.sourceChannelFollowers,
    project.sourceCommentCount,
    project.sourceLikeCount,
    project.sourceType,
    project.sourceUrl,
    project.sourceViewCount,
  ])

  useEffect(() => {
    const player = videoRef.current
    if (!player) {
      return
    }
    const trySeek = () => {
      const pendingTime = resumeSeekRef.current
      if (pendingTime === null || !Number.isFinite(pendingTime) || pendingTime < 0) {
        resumeSeekRef.current = null
        return
      }
      const targetTime = player.duration
        ? Math.min(Math.max(0, pendingTime), player.duration)
        : Math.max(0, pendingTime)
      player.currentTime = targetTime
      setCurrentTime(targetTime)
      resumeSeekRef.current = null
    }

    if (player.readyState >= 1) {
      trySeek()
      return
    }

    player.addEventListener("loadedmetadata", trySeek, { once: true })
    return () => {
      player.removeEventListener("loadedmetadata", trySeek)
    }
  }, [controller.media.videoUrl, setCurrentTime])

  const sourceLabel =
    project.sourceType === "youtube"
      ? "YouTube"
      : project.sourceType === "local"
        ? t("workspaceView.sourceLabelFile")
        : t("workspaceView.sourceLabelSource")
  const sourceStatusLabel =
    project.sourceStatus === "ready"
      ? t("workspaceView.sourceStatusReady")
      : project.sourceStatus === "failed"
        ? t("workspaceView.sourceStatusError")
        : project.sourceStatus === "pending"
          ? t("workspaceView.sourceStatusImport")
          : t("workspaceView.sourceStatusNone")
  const activeDuration = Math.round(
    project.sourceDurationSeconds ?? project.durationSeconds ?? controller.media.duration ?? 0,
  )
  const compactStatus = controller.ai.isAnyProcessing
    ? t("workspaceView.compactStatusAiUpdating")
    : !hydrationResolved
      ? t("workspaceView.compactStatusRestoring")
      : isMediaBootstrapPending
        ? t("workspaceView.compactStatusConnectingMedia")
      : t("workspaceView.compactStatusReady", {
          sourceLabel,
          sourceStatusLabel,
          duration: Math.max(0, activeDuration),
          clips: controller.clips.length,
        })
  const modeTitles: Record<WorkspaceMode, string> = {
    video: t("workspace.modes.video"),
    clips: t("workspace.modes.clips"),
    export: t("workspace.modes.export"),
    insights: t("workspace.modes.insights"),
    thumbnails: t("workspace.modes.thumbnails"),
  }

  const modeDescriptions: Record<WorkspaceMode, string> = {
    video: t("workspace.modeDescriptions.video"),
    clips: t("workspace.modeDescriptions.clips"),
    export: t("workspace.modeDescriptions.export"),
    insights: t("workspace.modeDescriptions.insights"),
    thumbnails: t("workspace.modeDescriptions.thumbnails"),
  }
  const openProjectMediaLocation = useCallback(async () => {
    const mediaPath = resolvedProjectSourceCandidate?.trim()
    if (!mediaPath) {
      pushToast({
        title: t("workspaceView.fileNotFoundTitle"),
        description: t("workspaceView.fileNotFoundDescription"),
        tone: "info",
        durationMs: 2800,
      })
      return
    }
    try {
      await openPathInFileManager(mediaPath)
    } catch (error) {
      pushToast({
        title: t("workspaceView.openPathFailedTitle"),
        description: resolveErrorMessage(error, t("workspaceView.openPathFailedDescription")),
        tone: "error",
        durationMs: 3600,
      })
    }
  }, [pushToast, resolvedProjectSourceCandidate, t])

  const openProjectsFolder = useCallback(async () => {
    try {
      await openProjectsRootDir()
    } catch (error) {
      pushToast({
        title: t("workspaceView.openProjectsFolderFailedTitle"),
        description: resolveErrorMessage(error, t("workspaceView.openProjectsFolderFailedDescription")),
        tone: "error",
        durationMs: 3400,
      })
    }
  }, [pushToast, t])

  const reportPersistenceError = useCallback(
    (scope: string, error: unknown) => {
      console.error(`Failed to persist ${scope}:`, error)
      const now = Date.now()
      if (now - persistErrorReportedAtRef.current < 6000) {
        return
      }
      persistErrorReportedAtRef.current = now
      pushToast({
        title: t("workspaceView.saveChangesFailedTitle"),
        description: resolveErrorMessage(
          error,
          t("workspaceView.saveChangesFailedDescription"),
        ),
        tone: "error",
        durationMs: 3600,
      })
    },
    [pushToast, t],
  )

  const persistWorkspaceSnapshot = useCallback(
    (payload: WorkspacePersistedState, snapshot: string) => {
      pendingWorkspaceSnapshotRef.current = snapshot
      pendingWorkspacePayloadRef.current = payload
      return saveProjectWorkspaceState(project.id, payload)
        .then(() => {
          lastWorkspaceSnapshotRef.current = snapshot
          if (pendingWorkspaceSnapshotRef.current === snapshot) {
            pendingWorkspaceSnapshotRef.current = null
            pendingWorkspacePayloadRef.current = null
          }
        })
        .catch((error) => {
          reportPersistenceError("workspace state", error)
        })
    },
    [project.id, reportPersistenceError],
  )

  const buildResumePayload = useCallback(
    (): Pick<ProjectResumeState, "activeMode" | "currentTime" | "activeClipId"> => ({
      activeMode,
      currentTime: Number(controller.media.currentTime.toFixed(1)),
      activeClipId: controller.activeClipId,
    }),
    [activeMode, controller.activeClipId, controller.media.currentTime],
  )

  const persistResumeSnapshot = useCallback(
    (
      payload: Pick<ProjectResumeState, "activeMode" | "currentTime" | "activeClipId">,
      snapshot: string,
    ) => {
      pendingResumeSnapshotRef.current = snapshot
      pendingResumePayloadRef.current = payload
      return saveProjectResumeState(project.id, payload)
        .then(() => {
          lastResumeSnapshotRef.current = snapshot
          if (pendingResumeSnapshotRef.current === snapshot) {
            pendingResumeSnapshotRef.current = null
            pendingResumePayloadRef.current = null
          }
        })
        .catch((error) => {
          reportPersistenceError("resume state", error)
        })
    },
    [project.id, reportPersistenceError],
  )

  const flushPersistence = useCallback(() => {
    if (!hydrationResolved) {
      return
    }

    const workspacePayload = pendingWorkspacePayloadRef.current ?? exportSessionState()
    const workspaceSnapshot =
      pendingWorkspaceSnapshotRef.current ?? JSON.stringify(workspacePayload)
    if (workspaceSnapshot !== lastWorkspaceSnapshotRef.current) {
      void persistWorkspaceSnapshot(workspacePayload, workspaceSnapshot)
    }

    const resumePayload = pendingResumePayloadRef.current ?? buildResumePayload()
    const resumeSnapshot =
      pendingResumeSnapshotRef.current ??
      `${resumePayload.activeMode}|${resumePayload.currentTime}|${resumePayload.activeClipId ?? ""}`
    if (resumeSnapshot !== lastResumeSnapshotRef.current) {
      void persistResumeSnapshot(resumePayload, resumeSnapshot)
    }
  }, [
    buildResumePayload,
    exportSessionState,
    hydrationResolved,
    persistResumeSnapshot,
    persistWorkspaceSnapshot,
  ])

  useEffect(() => {
    flushPersistenceRef.current = flushPersistence
  }, [flushPersistence])

  useEffect(() => {
    lastProjectMetricsSnapshotRef.current = `${project.clips}|${project.durationSeconds}`
  }, [project.clips, project.durationSeconds, project.id])

  useEffect(() => {
    if (!hydrationResolved) {
      return
    }
    if (controller.transcript.isTranscribing) {
      return
    }
    const payload = exportSessionState()
    const snapshot = JSON.stringify(payload)
    if (
      snapshot === lastWorkspaceSnapshotRef.current ||
      snapshot === pendingWorkspaceSnapshotRef.current
    ) {
      return
    }
    pendingWorkspaceSnapshotRef.current = snapshot
    pendingWorkspacePayloadRef.current = payload

    const timerId = window.setTimeout(() => {
      void persistWorkspaceSnapshot(payload, snapshot)
    }, 880)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [
    controller.transcript.isTranscribing,
    exportSessionState,
    hydrationResolved,
    persistWorkspaceSnapshot,
  ])

  useEffect(() => {
    if (!hydrationResolved) {
      return
    }
    const payload = exportSessionState()
    const snapshot = JSON.stringify(payload)
    if (
      snapshot === lastWorkspaceSnapshotRef.current ||
      snapshot === pendingWorkspaceSnapshotRef.current
    ) {
      return
    }
    pendingWorkspaceSnapshotRef.current = snapshot
    pendingWorkspacePayloadRef.current = payload

    const timerId = window.setTimeout(() => {
      void persistWorkspaceSnapshot(payload, snapshot)
    }, 180)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [
    controller.activeClipId,
    controller.clips,
    exportSessionState,
    hydrationResolved,
    persistWorkspaceSnapshot,
  ])

  useEffect(() => {
    if (!hydrationResolved) {
      return
    }
    const resumePayload = buildResumePayload()
    const resumeSnapshot =
      `${resumePayload.activeMode}|${resumePayload.currentTime}|${resumePayload.activeClipId ?? ""}`
    if (
      resumeSnapshot === lastResumeSnapshotRef.current ||
      resumeSnapshot === pendingResumeSnapshotRef.current
    ) {
      return
    }
    pendingResumeSnapshotRef.current = resumeSnapshot
    pendingResumePayloadRef.current = resumePayload

    const timerId = window.setTimeout(() => {
      void persistResumeSnapshot(resumePayload, resumeSnapshot)
    }, 960)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [
    buildResumePayload,
    hydrationResolved,
    persistResumeSnapshot,
  ])

  useEffect(() => {
    const flushNow = () => {
      flushPersistenceRef.current?.()
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushNow()
      }
    }

    window.addEventListener("beforeunload", flushNow)
    document.addEventListener("visibilitychange", onVisibilityChange)

    return () => {
      window.removeEventListener("beforeunload", flushNow)
      document.removeEventListener("visibilitychange", onVisibilityChange)
      flushNow()
    }
  }, [])

  useEffect(() => {
    if (!hydrationResolved || !onProjectPatch) {
      return
    }

    if (
      !hasHydratedWorkspaceStateRef.current &&
      controller.clips.length === 0 &&
      project.clips > 0
    ) {
      return
    }

    const clipsCount = controller.clips.length
    const durationSeconds =
      controller.media.duration > 0
        ? Math.max(0, Math.round(controller.media.duration))
        : Math.max(0, project.durationSeconds)

    const snapshot = `${clipsCount}|${durationSeconds}`
    if (snapshot === lastProjectMetricsSnapshotRef.current) {
      return
    }
    lastProjectMetricsSnapshotRef.current = snapshot
    onProjectPatch(project.id, {
      clips: clipsCount,
      durationSeconds,
    })
  }, [
    controller.clips.length,
    controller.media.duration,
    hydrationResolved,
    onProjectPatch,
    project.clips,
    project.durationSeconds,
    project.id,
  ])

  return (
    <section className="relative mx-auto h-full w-full min-h-0 overflow-visible px-4 pb-5 pt-12 lg:px-6 lg:pt-14">
      <AmbientBackground variant="workspace" />

      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (!file) {
            return
          }
          controller.actions.setUploadedVideo(file)
          setActiveMode("video")
        }}
      />

      <motion.div
        key="workspace-view"
        initial={false}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={workspaceMotion.page}
        className="relative z-10 flex h-full min-h-0 flex-col gap-4"
      >
        <header className="glass-panel relative z-10 flex flex-col gap-3 rounded-2xl border border-white/12 bg-white/4 px-4 py-4 backdrop-blur-xl md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              className="border-white/15 bg-transparent text-zinc-200 hover:bg-white/10"
              onClick={() => {
                flushPersistence()
                onBack()
              }}
            >
              <ArrowLeftIcon className="size-4" />
              {t("workspaceView.projects")}
            </Button>
            <div>
              <p className="text-xs tracking-[0.18em] text-zinc-500 uppercase">{t("workspaceView.workspace")}</p>
              <h2 className="text-lg font-semibold text-zinc-100">{project.name}</h2>
              <p className="max-w-[74vw] truncate text-xs text-zinc-400 md:max-w-[52vw]">
                {modeTitles[activeMode]}: {modeDescriptions[activeMode]}
              </p>
            </div>
          </div>

          <div className="flex min-w-0 items-center gap-2 md:max-w-[56%] md:justify-end">
            <div className="hidden min-w-0 xl:block">
              {activeMode === "video" && controller.ai.isAnyProcessing ? (
                <ShinyText
                  text={t("workspaceView.aiSyncingTimeline")}
                  speed={2.2}
                  className="min-w-0 truncate text-xs text-zinc-400"
                />
              ) : (
                <p className="min-w-0 truncate text-xs text-zinc-500">{compactStatus}</p>
              )}
            </div>
            <TooltipProvider>
              <div className="flex items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      className="text-zinc-400 hover:bg-white/8 hover:text-zinc-200"
                      onClick={openProjectMediaLocation}
                      disabled={!resolvedProjectSourceCandidate}
                    >
                      <FolderOpenIcon className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("workspaceView.mediaFolder")}</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      className="text-zinc-400 hover:bg-white/8 hover:text-zinc-200"
                      onClick={openProjectsFolder}
                    >
                      <FolderOpenIcon className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("workspaceView.projectsFolder")}</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      className="text-zinc-400 hover:bg-white/8 hover:text-zinc-200"
                      onClick={() => {
                        flushPersistence()
                        onOpenSettings()
                      }}
                    >
                      <Settings2Icon className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t("workspaceView.settings")}</TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          </div>
        </header>

        <div className="relative z-10 grid min-h-0 flex-1 gap-4 lg:grid-cols-[64px_minmax(0,1fr)_332px]">
          <ModeRail activeMode={activeMode} onModeChange={handleModeChange} />

          <section className="glass-panel flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/12 bg-white/3 backdrop-blur-xl">
            <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-hidden px-4 py-4">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={`mode-${activeMode}`}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={workspaceMotion.modeSwitch}
                  className="h-full min-h-0 overflow-hidden"
                >
                  {modeContent}
                </motion.div>
              </AnimatePresence>
            </div>
          </section>

          <aside className="glass-panel min-h-0 overflow-hidden rounded-2xl border border-white/12 bg-white/3 backdrop-blur-xl">
            <div className="h-full overflow-x-hidden overflow-y-auto p-3" data-scroll-region="true">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={`context-${activeMode}`}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={workspaceMotion.contextSwitch}
                >
                  {contextContent}
                </motion.div>
              </AnimatePresence>
            </div>
          </aside>
        </div>
      </motion.div>
    </section>
  )
}
