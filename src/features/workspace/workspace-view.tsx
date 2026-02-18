import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  ArrowLeftIcon,
  FolderOpenIcon,
  Settings2Icon,
  SparklesIcon,
} from "lucide-react"

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
  type ProjectResumeState,
  saveProjectResumeState,
  saveProjectWorkspaceState,
  type WorkspacePersistedState,
} from "@/shared/tauri/backend"

type WorkspaceViewProps = {
  project: Project
  initialMode?: WorkspaceMode | null
  onBack: () => void
  onOpenSettings: () => void
  onProjectPatch?: (projectId: string, patch: Partial<Project>) => void
}

const modeTitles: Record<WorkspaceMode, string> = {
  video: "Редактор",
  clips: "Сборка клипов",
  export: "Экспорт",
  insights: "Аналитика",
  thumbnails: "Генератор обложек",
}

const modeDescriptions: Record<WorkspaceMode, string> = {
  video: "Единое рабочее полотно: плеер, таймлайн и семантическая расшифровка.",
  clips: "Детальная подготовка клипов к релизу и экспортным сценариям.",
  export: "Точечная настройка заголовка, описания, тегов и платформ для каждого клипа.",
  insights: "Виральный потенциал, хуки, контент-план и серия публикаций.",
  thumbnails: "Живые шаблоны обложек с редактируемыми оверлеями.",
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
  const isStaleYoutubeSourceUrl =
    sourceType === "youtube" &&
    typeof sourceUrl === "string" &&
    sourceUrl.trim().length > 0 &&
    restoredVideoUrl.length > 0 &&
    restoredVideoUrl === sourceUrl

  if (isStaleYoutubeSourceUrl) {
    return hasTranscript || hasSemantic || hasClips
  }
  return restoredVideoUrl.length > 0 || hasTranscript || hasSemantic || hasClips
}

export function WorkspaceView({
  project,
  initialMode = null,
  onBack,
  onOpenSettings,
  onProjectPatch,
}: WorkspaceViewProps) {
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

  const openFilePicker = () => fileInputRef.current?.click()
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
              text={hydrationResolved ? "Подключаем медиа проекта..." : "Восстанавливаем проект..."}
              speed={2.1}
              className="text-sm text-zinc-200"
            />
            <p className="text-xs text-zinc-500">
              {hydrationResolved
                ? "Подтягиваем источник видео и синхронизируем рабочее состояние."
                : "Загружаем видео, клипы и контекст из сохраненного состояния."}
            </p>
          </div>
        </div>
      )
    }
    if (activeMode === "video") {
      return <VideoMode controller={controller} videoRef={videoRef} onOpenFilePicker={openFilePicker} />
    }
    if (activeMode === "clips") {
      return (
        <ClipsMode
          controller={controller}
          videoRef={videoRef}
          onOpenCoverMode={() => handleModeChange("thumbnails")}
          onOpenExportMode={() => handleModeChange("export")}
        />
      )
    }
    if (activeMode === "export") {
      return (
        <ExportMode
          controller={controller}
          projectId={project.id}
          projectName={project.name}
          sourcePath={project.importedMediaPath ?? null}
          onOpenCoverMode={() => handleModeChange("thumbnails")}
        />
      )
    }
    if (activeMode === "insights") {
      return <InsightsMode controller={controller} project={project} />
    }
    return <ThumbnailsMode controller={controller} />
  }, [activeMode, controller, handleModeChange, hydrationResolved, isMediaBootstrapPending, project])

  const contextContent = useMemo(() => {
    if (!hydrationResolved || isMediaBootstrapPending) {
      return (
        <div className="rounded-xl border border-white/10 bg-black/24 px-3 py-3">
          <p className="text-xs text-zinc-400">Системный контекст</p>
          <p className="mt-1 text-xs text-zinc-500">
            {hydrationResolved
              ? "Подключаем источник видео и проверяем контекст проекта."
              : "Поднимаем сохранённые данные проекта и рабочее окружение."}
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
  }, [activeMode, controller, handleModeChange, hydrationResolved, isMediaBootstrapPending, project])

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
        ? "Файл"
        : "Источник"
  const sourceStatusLabel =
    project.sourceStatus === "ready"
      ? "Готов"
      : project.sourceStatus === "failed"
        ? "Ошибка"
        : project.sourceStatus === "pending"
          ? "Импорт"
          : "Без статуса"
  const activeDuration = Math.round(
    project.sourceDurationSeconds ?? project.durationSeconds ?? controller.media.duration ?? 0,
  )
  const compactStatus = controller.ai.isAnyProcessing
    ? "ИИ обновляет блоки и метрики..."
    : !hydrationResolved
      ? "Восстанавливаем состояние проекта..."
      : isMediaBootstrapPending
        ? "Подключаем медиа проекта..."
      : `${sourceLabel} · ${sourceStatusLabel} · ${Math.max(0, activeDuration)} с · клипы ${controller.clips.length}`
  const openProjectMediaLocation = useCallback(async () => {
    const mediaPath = project.importedMediaPath?.trim()
    if (!mediaPath) {
      pushToast({
        title: "Файл не найден",
        description: "Сначала загрузите или импортируйте видео в проект.",
        tone: "info",
        durationMs: 2800,
      })
      return
    }
    try {
      await openPathInFileManager(mediaPath)
    } catch (error) {
      pushToast({
        title: "Не удалось открыть путь",
        description: error instanceof Error ? error.message : "Проверьте доступ к папке.",
        tone: "error",
        durationMs: 3600,
      })
    }
  }, [project.importedMediaPath, pushToast])

  const openProjectsFolder = useCallback(async () => {
    try {
      await openProjectsRootDir()
    } catch (error) {
      pushToast({
        title: "Не удалось открыть папку проектов",
        description: error instanceof Error ? error.message : "Повторите попытку.",
        tone: "error",
        durationMs: 3400,
      })
    }
  }, [pushToast])

  const reportPersistenceError = useCallback(
    (scope: string, error: unknown) => {
      console.error(`Failed to persist ${scope}:`, error)
      const now = Date.now()
      if (now - persistErrorReportedAtRef.current < 6000) {
        return
      }
      persistErrorReportedAtRef.current = now
      pushToast({
        title: "Не удалось сохранить изменения",
        description:
          error instanceof Error
            ? error.message
            : "Проверьте доступ к хранилищу проекта и повторите попытку.",
        tone: "error",
        durationMs: 3600,
      })
    },
    [pushToast],
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
              Проекты
            </Button>
            <div>
              <p className="text-xs tracking-[0.18em] text-zinc-500 uppercase">Рабочее пространство</p>
              <h2 className="text-lg font-semibold text-zinc-100">{project.name}</h2>
            </div>
          </div>

          <div className="flex min-w-0 items-center gap-2 md:max-w-[56%] md:justify-end">
            <div className="hidden min-w-0 xl:block">
              {activeMode === "video" && controller.ai.isAnyProcessing ? (
                <ShinyText
                  text="ИИ синхронизирует таймлайн, блоки и прогнозы виральности."
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
                      disabled={!project.importedMediaPath}
                    >
                      <FolderOpenIcon className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Папка медиа</TooltipContent>
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
                  <TooltipContent>Папка проектов</TooltipContent>
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
                  <TooltipContent>Настройки</TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          </div>
        </header>

        <div className="relative z-10 grid min-h-0 flex-1 gap-4 lg:grid-cols-[64px_minmax(0,1fr)_360px]">
          <ModeRail activeMode={activeMode} onModeChange={handleModeChange} />

          <section className="glass-panel flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/12 bg-white/3 backdrop-blur-xl">
            <header className="border-b border-white/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <SparklesIcon className="size-4 text-zinc-300" />
                <h3 className="text-sm font-semibold text-zinc-100">{modeTitles[activeMode]}</h3>
              </div>
              <p className="mt-1 text-xs text-zinc-400">{modeDescriptions[activeMode]}</p>
            </header>

            <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-hidden px-4 pb-4 pt-3">
              <AnimatePresence mode="sync" initial={false}>
                <motion.div
                  key={`mode-${activeMode}`}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={workspaceMotion.modeSwitch}
                  className="h-full min-h-0"
                >
                  {modeContent}
                </motion.div>
              </AnimatePresence>
            </div>
          </section>

          <aside className="glass-panel min-h-0 overflow-hidden rounded-2xl border border-white/12 bg-white/3 backdrop-blur-xl">
            <div className="h-full overflow-x-hidden overflow-y-auto p-3" data-scroll-region="true">
              <AnimatePresence mode="sync" initial={false}>
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
