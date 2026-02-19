import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { convertFileSrc } from "@tauri-apps/api/core"
import {
  DownloadIcon,
  FolderOpenIcon,
  ImageIcon,
  Redo2Icon,
  RefreshCcwIcon,
  SparklesIcon,
  TagIcon,
  TypeIcon,
  Undo2Icon,
  UploadIcon,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { formatSeconds } from "@/app/mock-data"
import type {
  ClipCanvasAspect,
  ClipCanvasDraft,
  ClipSegment,
  ExportClipDraft,
  PlatformPreset,
  SubtitlePreset,
  ThumbnailTemplate,
} from "@/app/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { WorkspaceController } from "@/features/workspace/workspace-controller-types"
import { subtitlePresets as builtInSubtitlePresets } from "@/features/workspace/mock-ai"
import {
  defaultResolutionByAspect,
  normalizeClipCanvasResolution,
  parseClipCanvasResolution,
} from "@/features/workspace/canvas-presets"
import {
  exportClipsBatch,
  openPathInFileManager,
  pickLocalCoverImageFile,
  type ClipBatchExportRequest,
} from "@/shared/tauri/backend"
import { isTauriRuntime } from "@/shared/tauri/runtime"
import { useAppToast } from "@/shared/ui/app-toast-provider"

type ExportModeProps = {
  controller: WorkspaceController
  projectId: string
  projectName: string
  sourcePath: string | null
  onOpenCoverMode: () => void
}

const tokenize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4)

const parseAspectRatio = (value: string) => {
  const parts = value.split(":").map((chunk) => Number(chunk.trim()))
  const width = Number.isFinite(parts[0]) && parts[0] > 0 ? parts[0] : 16
  const height = Number.isFinite(parts[1]) && parts[1] > 0 ? parts[1] : 9
  return `${width} / ${height}`
}

const normalizeCanvasAspect = (value: string | null | undefined): ClipCanvasAspect => {
  const compact = (value ?? "").replace(/\s+/g, "")
  if (compact === "9:16") {
    return "9:16"
  }
  if (compact === "16:9") {
    return "16:9"
  }
  if (compact === "1:1") {
    return "1:1"
  }
  return "16:9"
}

const resolveErrorMessage = (error: unknown, fallback: string): string => {
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

const defaultCanvasDraft = (aspect: string): ClipCanvasDraft => ({
  aspect: normalizeCanvasAspect(aspect),
  resolution: defaultResolutionByAspect[normalizeCanvasAspect(aspect)],
  fitMode: "cover",
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  subtitlePosition: "bottom",
  subtitleOffsetX: 0,
  subtitleOffsetY: 0,
  subtitleBoxWidth: 1,
  subtitleBoxHeight: 1,
})

const normalizeCanvasDraft = (
  value: Partial<ClipCanvasDraft> | undefined,
  fallbackAspect: string,
): ClipCanvasDraft => {
  const base = defaultCanvasDraft(fallbackAspect)
  if (!value) {
    return base
  }
  const aspect = value.aspect
    ? normalizeCanvasAspect(value.aspect)
    : normalizeCanvasAspect(fallbackAspect)
  return {
    aspect,
    resolution: normalizeClipCanvasResolution(
      aspect,
      value.resolution,
    ),
    fitMode: value.fitMode === "contain" ? "contain" : "cover",
    zoom:
      typeof value.zoom === "number" && Number.isFinite(value.zoom)
        ? Math.min(3, Math.max(0.35, value.zoom))
        : base.zoom,
    offsetX:
      typeof value.offsetX === "number" && Number.isFinite(value.offsetX)
        ? Math.min(1, Math.max(-1, value.offsetX))
        : base.offsetX,
    offsetY:
      typeof value.offsetY === "number" && Number.isFinite(value.offsetY)
        ? Math.min(1, Math.max(-1, value.offsetY))
        : base.offsetY,
    subtitlePosition: "bottom",
    subtitleOffsetX:
      typeof value.subtitleOffsetX === "number" && Number.isFinite(value.subtitleOffsetX)
        ? Math.min(1, Math.max(-1, value.subtitleOffsetX))
        : base.subtitleOffsetX,
    subtitleOffsetY:
      typeof value.subtitleOffsetY === "number" && Number.isFinite(value.subtitleOffsetY)
        ? Math.min(1, Math.max(-1, value.subtitleOffsetY))
        : base.subtitleOffsetY,
    subtitleBoxWidth:
      typeof value.subtitleBoxWidth === "number" && Number.isFinite(value.subtitleBoxWidth)
        ? Math.min(1.65, Math.max(0.55, value.subtitleBoxWidth))
        : base.subtitleBoxWidth,
    subtitleBoxHeight:
      typeof value.subtitleBoxHeight === "number" && Number.isFinite(value.subtitleBoxHeight)
        ? Math.min(1.65, Math.max(0.55, value.subtitleBoxHeight))
        : base.subtitleBoxHeight,
  }
}

function makeDefaultDraft(
  clip: ClipSegment,
  presets: PlatformPreset[],
  defaultPlatformIds: string[],
  defaultTemplateId: string | null,
): ExportClipDraft {
  const platformCovers: ExportClipDraft["platformCovers"] = {}
  for (const preset of presets) {
    platformCovers[preset.id] = {
      coverMode: "generated",
      templateId: defaultTemplateId,
      customCoverPath: null,
      customCoverName: null,
    }
  }
  const fallbackAspect = presets[0]?.aspect ?? "16:9"

  return {
    title: clip.title,
    description: `Clip ${formatSeconds(clip.start)}-${formatSeconds(clip.end)}. Key excerpt for short-form content.`,
    tags: "",
    subtitleEnabled: false,
    platformIds: defaultPlatformIds,
    platformCovers,
    canvas: defaultCanvasDraft(fallbackAspect),
  }
}

function resolveTemplate(
  templates: ThumbnailTemplate[],
  templateId: string | null,
): ThumbnailTemplate | null {
  if (templates.length === 0) {
    return null
  }
  return templates.find((template) => template.id === templateId) ?? templates[0]
}

function isCoverReady(
  cover: ExportClipDraft["platformCovers"][string] | undefined,
  templates: ThumbnailTemplate[],
): boolean {
  if (!cover) {
    return false
  }
  if (cover.coverMode === "custom") {
    return Boolean(cover.customCoverPath)
  }
  return Boolean(resolveTemplate(templates, cover.templateId))
}

function toCoverPreviewUrl(
  coverPath: string | null,
  webBlobMap: Record<string, string>,
): string | null {
  if (!coverPath) {
    return null
  }
  if (coverPath.startsWith("blob:")) {
    return webBlobMap[coverPath] ?? coverPath
  }
  if (isTauriRuntime()) {
    return convertFileSrc(coverPath)
  }
  return coverPath
}

function hasRenderableProfile(preset: SubtitlePreset | null | undefined): boolean {
  if (!preset) {
    return false
  }
  const profile = preset.renderProfile
  return Boolean(
    profile &&
      typeof profile.fontFamily === "string" &&
      Number.isFinite(profile.fontSize) &&
      Number.isFinite(profile.maxWordsPerLine),
  )
}

export default function ExportMode({
  controller,
  projectId,
  projectName,
  sourcePath,
  onOpenCoverMode,
}: ExportModeProps) {
  const { clips, actions, activeClipId, ai, transcript, exports, timeline } = controller
  const { t } = useTranslation()
  const { pushToast } = useAppToast()
  const uploadInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const objectUrlsRef = useRef<Set<string>>(new Set())
  const [isExporting, setIsExporting] = useState(false)
  const [webBlobMap, setWebBlobMap] = useState<Record<string, string>>({})
  const hasSourcePath = (sourcePath?.trim().length ?? 0) > 0
  const subtitlesAvailable = transcript.words.length > 0

  useEffect(() => {
    const objectUrls = objectUrlsRef.current
    return () => {
      for (const url of objectUrls) {
        URL.revokeObjectURL(url)
      }
      objectUrls.clear()
    }
  }, [])

  useEffect(() => {
    if (!activeClipId && clips.length > 0) {
      actions.setActiveClipId(clips[0].id)
    }
  }, [actions, activeClipId, clips])

  const defaultTemplateId = useMemo(() => {
    if (ai.thumbnailTemplates.length === 0) {
      return null
    }
    return ai.activeThumbnailTemplateId || ai.thumbnailTemplates[0]?.id || null
  }, [ai.activeThumbnailTemplateId, ai.thumbnailTemplates])

  const defaultPlatformIds = useMemo(() => {
    if (ai.selectedPlatformPresetIds.length > 0) {
      return ai.selectedPlatformPresetIds
    }
    return ai.platformPresets.slice(0, 1).map((preset) => preset.id)
  }, [ai.platformPresets, ai.selectedPlatformPresetIds])

  const clipById = useMemo(() => new Map(clips.map((clip) => [clip.id, clip])), [clips])
  const platformById = useMemo(
    () => new Map(ai.platformPresets.map((preset) => [preset.id, preset])),
    [ai.platformPresets],
  )
  const validPlatformIdSet = useMemo(
    () => new Set(ai.platformPresets.map((preset) => preset.id)),
    [ai.platformPresets],
  )
  const builtInSubtitleById = useMemo(
    () => new Map(builtInSubtitlePresets.map((preset) => [preset.id, preset])),
    [],
  )
  const activeSubtitlePreset = useMemo(() => {
    const selected =
      ai.subtitlePresets.find((preset) => preset.id === ai.activeSubtitlePresetId) ?? null
    if (hasRenderableProfile(selected)) {
      return selected
    }
    if (selected?.id && hasRenderableProfile(builtInSubtitleById.get(selected.id))) {
      return builtInSubtitleById.get(selected.id) ?? null
    }
    const firstRuntime = ai.subtitlePresets.find((preset) => hasRenderableProfile(preset)) ?? null
    if (firstRuntime) {
      return firstRuntime
    }
    return builtInSubtitlePresets.find((preset) => hasRenderableProfile(preset)) ?? null
  }, [ai.activeSubtitlePresetId, ai.subtitlePresets, builtInSubtitleById])

  const buildClipDraft = useCallback(
    (clip: ClipSegment, existing?: ExportClipDraft): ExportClipDraft => {
      if (!existing) {
        return makeDefaultDraft(clip, ai.platformPresets, defaultPlatformIds, defaultTemplateId)
      }

      const merged = makeDefaultDraft(clip, ai.platformPresets, defaultPlatformIds, defaultTemplateId)
      const safePlatformIds = existing.platformIds.filter((id) => validPlatformIdSet.has(id))
      const primaryPlatform = ai.platformPresets.find((preset) =>
        safePlatformIds.includes(preset.id),
      )
      const fallbackAspect = primaryPlatform?.aspect ?? ai.platformPresets[0]?.aspect ?? "16:9"

      for (const preset of ai.platformPresets) {
        const previousCover = existing.platformCovers[preset.id]
        if (!previousCover) {
          continue
        }
        merged.platformCovers[preset.id] = {
          coverMode:
            previousCover.coverMode === "custom" && previousCover.customCoverPath
              ? "custom"
              : "generated",
          templateId: previousCover.templateId || merged.platformCovers[preset.id]?.templateId || null,
          customCoverPath: previousCover.customCoverPath || null,
          customCoverName: previousCover.customCoverName || null,
        }
      }

      return {
        ...merged,
        title: existing.title || merged.title,
        description: existing.description || merged.description,
        tags: existing.tags ?? "",
        subtitleEnabled:
          subtitlesAvailable &&
          (typeof existing.subtitleEnabled === "boolean" ? existing.subtitleEnabled : false),
        platformIds: safePlatformIds.length > 0 ? safePlatformIds : merged.platformIds,
        canvas: normalizeCanvasDraft(existing.canvas, fallbackAspect),
      }
    },
    [ai.platformPresets, defaultPlatformIds, defaultTemplateId, subtitlesAvailable, validPlatformIdSet],
  )

  const draftsByClip = useMemo(() => {
    const next: Record<string, ExportClipDraft> = {}
    for (const clip of clips) {
      next[clip.id] = buildClipDraft(clip, exports.clipDrafts[clip.id])
    }
    return next
  }, [buildClipDraft, clips, exports.clipDrafts])

  const activeClip = useMemo(
    () => clips.find((clip) => clip.id === activeClipId) ?? clips[0] ?? null,
    [activeClipId, clips],
  )
  const activeDraft = activeClip ? draftsByClip[activeClip.id] : null

  useEffect(() => {
    const existingIds = new Set(clips.map((clip) => clip.id))
    const currentDrafts = exports.clipDrafts
    let needsSync = false
    for (const clip of clips) {
      if (!currentDrafts[clip.id]) {
        needsSync = true
        break
      }
    }
    if (!needsSync) {
      for (const clipId of Object.keys(currentDrafts)) {
        if (!existingIds.has(clipId)) {
          needsSync = true
          break
        }
      }
    }
    if (!needsSync) {
      return
    }
    actions.setExportClipDrafts(draftsByClip)
  }, [actions, clips, draftsByClip, exports.clipDrafts])

  const updateDraft = (clipId: string, updater: (draft: ExportClipDraft) => ExportClipDraft) => {
    const clip = clipById.get(clipId)
    if (!clip) {
      return
    }
    const next = {
      ...exports.clipDrafts,
      [clipId]: updater(buildClipDraft(clip, exports.clipDrafts[clipId])),
    }
    actions.setExportClipDrafts(next)
  }

  const revokeVirtualCover = (virtualPath: string | null | undefined) => {
    if (!virtualPath || !virtualPath.startsWith("blob:")) {
      return
    }
    setWebBlobMap((previous) => {
      const blobUrl = previous[virtualPath]
      if (!blobUrl) {
        return previous
      }
      URL.revokeObjectURL(blobUrl)
      objectUrlsRef.current.delete(blobUrl)
      const next = { ...previous }
      delete next[virtualPath]
      return next
    })
  }

  const updateMetadataField = (
    clipId: string,
    key: "title" | "description" | "tags",
    value: string,
  ) => {
    updateDraft(clipId, (draft) => ({ ...draft, [key]: value }))
  }

  const togglePlatformForClip = (clipId: string, presetId: string) => {
    updateDraft(clipId, (draft) => {
      const exists = draft.platformIds.includes(presetId)
      const nextPlatformIds = exists
        ? draft.platformIds.filter((id) => id !== presetId)
        : [...draft.platformIds, presetId]
      return { ...draft, platformIds: nextPlatformIds }
    })
  }

  const setGeneratedCover = (clipId: string, presetId: string) => {
    if (ai.thumbnailTemplates.length === 0) {
      pushToast({
        title: t("exportMode.templatesUnavailableTitle"),
        description: t("exportMode.templatesUnavailableDescription"),
        tone: "info",
        durationMs: 2800,
      })
      return
    }
    updateDraft(clipId, (draft) => {
      const current = draft.platformCovers[presetId]
      revokeVirtualCover(current?.customCoverPath)
      const currentIndex = ai.thumbnailTemplates.findIndex(
        (template) => template.id === current?.templateId,
      )
      const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % ai.thumbnailTemplates.length
      const nextTemplateId = ai.thumbnailTemplates[nextIndex]?.id ?? ai.thumbnailTemplates[0]?.id ?? null
      return {
        ...draft,
        platformCovers: {
          ...draft.platformCovers,
          [presetId]: {
            ...(current ?? {
              coverMode: "generated",
              templateId: nextTemplateId,
              customCoverPath: null,
              customCoverName: null,
            }),
            coverMode: "generated",
            templateId: nextTemplateId,
            customCoverPath: null,
            customCoverName: null,
          },
        },
      }
    })
  }

  const openUploadPicker = async (clipId: string, presetId: string) => {
    if (isTauriRuntime()) {
      const selectedPath = await pickLocalCoverImageFile()
      if (!selectedPath) {
        return
      }
      updateDraft(clipId, (draft) => ({
        ...draft,
        platformCovers: {
          ...draft.platformCovers,
          [presetId]: {
            ...(draft.platformCovers[presetId] ?? {
              coverMode: "generated",
              templateId: defaultTemplateId,
              customCoverPath: null,
              customCoverName: null,
            }),
            coverMode: "custom",
            customCoverPath: selectedPath,
            customCoverName: selectedPath.split(/[\\/]/).pop() ?? "cover",
          },
        },
      }))
      return
    }
    const key = `${clipId}:${presetId}`
    uploadInputRefs.current[key]?.click()
  }

  const removeCustomCover = (clipId: string, presetId: string) => {
    const draft = draftsByClip[clipId]
    const current = draft?.platformCovers[presetId]
    revokeVirtualCover(current?.customCoverPath)
    updateDraft(clipId, (prev) => ({
      ...prev,
      platformCovers: {
        ...prev.platformCovers,
        [presetId]: {
          ...(prev.platformCovers[presetId] ?? {
            coverMode: "generated",
            templateId: defaultTemplateId,
            customCoverPath: null,
            customCoverName: null,
          }),
          coverMode: "generated",
          customCoverPath: null,
          customCoverName: null,
        },
      },
    }))
  }

  const onUploadCustomCoverWeb = (clipId: string, presetId: string, file: File | null) => {
    if (!file) {
      return
    }
    const existingCoverPath = draftsByClip[clipId]?.platformCovers[presetId]?.customCoverPath ?? null
    revokeVirtualCover(existingCoverPath)
    const blobUrl = URL.createObjectURL(file)
    const virtualPath = `blob:${Math.random().toString(36).slice(2, 10)}`
    objectUrlsRef.current.add(blobUrl)
    setWebBlobMap((previous) => ({ ...previous, [virtualPath]: blobUrl }))

    updateDraft(clipId, (draft) => ({
      ...draft,
      platformCovers: {
        ...draft.platformCovers,
        [presetId]: {
          ...(draft.platformCovers[presetId] ?? {
            coverMode: "generated",
            templateId: defaultTemplateId,
            customCoverPath: null,
            customCoverName: null,
          }),
          coverMode: "custom",
          customCoverPath: virtualPath,
          customCoverName: file.name,
        },
      },
    }))
  }

  const generateTitle = (clip: ClipSegment) => {
    const hint = ai.hookCandidates[0]?.headline || clip.title
    updateMetadataField(clip.id, "title", hint.replace(/[.!?]+$/g, "").trim())
  }

  const generateDescription = (clip: ClipSegment) => {
    const hookReason = ai.hookCandidates[0]?.reasoning
    const description = hookReason
      ? `${projectName}: ${hookReason}`
      : t("exportMode.generatedDescriptionFallback", {
          projectName,
          start: formatSeconds(clip.start),
          end: formatSeconds(clip.end),
        })
    updateMetadataField(clip.id, "description", description)
  }

  const generateTags = (clip: ClipSegment) => {
    const text = transcript.words
      .filter((word) => word.start >= clip.start && word.end <= clip.end)
      .map((word) => word.text)
      .join(" ")
    const candidates = tokenize(text).length > 0 ? tokenize(text) : tokenize(`${projectName} ${clip.title}`)
    const unique = [...new Set(candidates)].slice(0, 7)
    updateMetadataField(clip.id, "tags", unique.map((token) => `#${token}`).join(" "))
  }

  const buildBatchRequest = (targetClipIds: string[]): ClipBatchExportRequest | null => {
    const trimmedSourcePath = sourcePath?.trim() ?? ""
    if (!trimmedSourcePath) {
      pushToast({
        title: t("exportMode.noSourceTitle"),
        description: t("exportMode.noSourceDescription"),
        tone: "error",
        durationMs: 3600,
      })
      return null
    }
    const tasks: ClipBatchExportRequest["tasks"] = []
    for (const clipId of targetClipIds) {
      const clip = clipById.get(clipId)
      const draft = draftsByClip[clipId]
      if (!clip || !draft) {
        continue
      }
      for (const platformId of draft.platformIds) {
        const preset = platformById.get(platformId)
        if (!preset) {
          continue
        }
        const cover = draft.platformCovers[platformId]
        const coverPath =
          cover?.coverMode === "custom" &&
          cover.customCoverPath &&
          !cover.customCoverPath.startsWith("blob:")
            ? cover.customCoverPath
            : null
        const effectiveCanvas = normalizeCanvasDraft(draft.canvas, draft.canvas.aspect)
        const outputResolution = parseClipCanvasResolution(effectiveCanvas.resolution)
        tasks.push({
          clipId: clip.id,
          platformId: preset.id,
          aspect: effectiveCanvas.aspect,
          start: clip.start,
          end: clip.end,
          outputWidth: outputResolution?.width ?? null,
          outputHeight: outputResolution?.height ?? null,
          fitMode: effectiveCanvas.fitMode,
          renderZoom: effectiveCanvas.zoom,
          renderOffsetX: effectiveCanvas.offsetX,
          renderOffsetY: effectiveCanvas.offsetY,
          subtitlesEnabled: Boolean(draft.subtitleEnabled),
          subtitlePositionOverride: effectiveCanvas.subtitlePosition,
          subtitleOffsetX: effectiveCanvas.subtitleOffsetX,
          subtitleOffsetY: effectiveCanvas.subtitleOffsetY,
          subtitleBoxWidth: effectiveCanvas.subtitleBoxWidth,
          subtitleBoxHeight: effectiveCanvas.subtitleBoxHeight,
          title: draft.title.trim() || clip.title,
          description: draft.description.trim() || null,
          tags: draft.tags.trim() || null,
          coverPath,
        })
      }
    }
    if (tasks.length === 0) {
      pushToast({
        title: t("exportMode.nothingToExportTitle"),
        description: t("exportMode.nothingToExportDescription"),
        tone: "info",
        durationMs: 2800,
      })
      return null
    }
    const hasSubtitleTasks = tasks.some((task) => Boolean(task.subtitlesEnabled))
    if (hasSubtitleTasks && !activeSubtitlePreset) {
      pushToast({
        title: t("exportMode.subtitlesUnavailableTitle"),
        description: t("exportMode.subtitlesUnavailableDescription"),
        tone: "error",
        durationMs: 3600,
      })
      return null
    }
    if (hasSubtitleTasks && transcript.words.length === 0) {
      pushToast({
        title: t("exportMode.noSubtitleDataTitle"),
        description: t("exportMode.noSubtitleDataDescription"),
        tone: "info",
        durationMs: 3400,
      })
      return null
    }

    return {
      projectId,
      projectName,
      sourcePath: trimmedSourcePath,
      taskId: `clip-export:${projectId}`,
      tasks,
      subtitles:
        hasSubtitleTasks && activeSubtitlePreset
          ? {
              enabled: true,
              presetId: activeSubtitlePreset.id,
              presetName: activeSubtitlePreset.name,
              renderProfile: activeSubtitlePreset.renderProfile,
              words: transcript.words,
            }
          : null,
    }
  }

  const runExport = async (targetClipIds: string[]) => {
    const request = buildBatchRequest(targetClipIds)
    if (!request) {
      return
    }
    setIsExporting(true)
    try {
      const result = await exportClipsBatch(request)
      pushToast({
        title: t("exportMode.exportCompletedTitle"),
        description: t("exportMode.exportCompletedDescription", { count: result.exportedCount }),
        tone: "success",
        durationMs: 3400,
      })
      if (result.projectDir) {
        void openPathInFileManager(result.projectDir).catch(() => {})
      }
    } catch (error) {
      pushToast({
        title: t("exportMode.exportFailedTitle"),
        description: resolveErrorMessage(error, t("exportMode.exportFailedDescription")),
        tone: "error",
        durationMs: 4200,
      })
    } finally {
      setIsExporting(false)
    }
  }

  const exportActiveClip = () => {
    if (!activeClip || !activeDraft) {
      return
    }
    void runExport([activeClip.id])
  }

  const exportAllClips = () => {
    void runExport(clips.map((clip) => clip.id))
  }

  if (clips.length === 0) {
    return (
      <div className="grid h-full min-h-[420px] place-content-center gap-2 rounded-xl border border-white/10 bg-black/24 text-zinc-500">
        <DownloadIcon className="mx-auto size-5" />
        <p className="text-sm">{t("exportMode.emptyState")}</p>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-x-hidden overflow-y-auto pr-1 pb-2">
      <div className="rounded-xl border border-white/10 bg-black/24 px-3 py-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-2">
            <p className="text-xs tracking-[0.15em] text-zinc-500 uppercase">{t("exportMode.title")}</p>
            <p className="mt-1 text-xs text-zinc-400">
              {t("exportMode.description")}
            </p>
            <p className="text-[11px] text-zinc-500">
              {t("exportMode.subtitleHint")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="xs"
              variant="outline"
              className="border-white/14 bg-transparent text-zinc-300 hover:bg-white/8"
              onClick={actions.undoTimeline}
              disabled={!timeline.canUndo || isExporting}
            >
              <Undo2Icon className="size-3.5" />
              {t("exportMode.undo")}
            </Button>
            <Button
              size="xs"
              variant="outline"
              className="border-white/14 bg-transparent text-zinc-300 hover:bg-white/8"
              onClick={actions.redoTimeline}
              disabled={!timeline.canRedo || isExporting}
            >
              <Redo2Icon className="size-3.5" />
              {t("exportMode.redo")}
            </Button>
            <Button
              size="sm"
              className="bg-zinc-100 text-zinc-950 hover:bg-zinc-100/90"
              onClick={exportAllClips}
              disabled={isExporting || !hasSourcePath}
            >
              <FolderOpenIcon className="size-4" />
              {t("exportMode.exportAll")}
            </Button>
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(250px,0.7fr)_minmax(0,1fr)]">
        <section className="min-h-0 rounded-xl border border-white/10 bg-black/24 p-2.5">
          <p className="mb-2 text-xs tracking-[0.14em] text-zinc-500 uppercase">{t("exportMode.projectClips")}</p>
          <div className="grid max-h-full gap-2 overflow-auto pr-1">
            {clips.map((clip) => {
              const draft = draftsByClip[clip.id]
              const selectedCount = draft?.platformIds.length ?? 0
              const readyCount = draft
                ? draft.platformIds.filter((id) =>
                    isCoverReady(draft.platformCovers[id], ai.thumbnailTemplates),
                  ).length
                : 0
              return (
                <button
                  key={clip.id}
                  onClick={() => actions.setActiveClipId(clip.id)}
                  className={[
                    "rounded-lg border px-3 py-2 text-left transition",
                    clip.id === activeClip?.id
                      ? "border-zinc-200/40 bg-zinc-100/12"
                      : "border-white/10 bg-white/6 hover:border-white/20",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="line-clamp-1 text-sm text-zinc-100">{clip.title}</p>
                    <span className="text-[11px] text-zinc-400">
                      {formatSeconds(clip.start)}-{formatSeconds(clip.end)}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-zinc-500">
                    {t("exportMode.platformsAndCovers", {
                      platforms: selectedCount,
                      coversReady: readyCount,
                      coversTotal: selectedCount,
                    })}
                  </p>
                </button>
              )
            })}
          </div>
        </section>

        <section className="min-h-0 space-y-3 overflow-auto pr-1">
          {activeClip && activeDraft ? (
            <article className="rounded-xl border border-white/10 bg-black/24 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-zinc-100">{activeClip.title}</p>
                  <p className="text-xs text-zinc-500">
                    {formatSeconds(activeClip.start)}-{formatSeconds(activeClip.end)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="xs"
                    variant="outline"
                    className="border-white/14 bg-transparent text-zinc-300 hover:bg-white/8"
                    onClick={onOpenCoverMode}
                  >
                    {t("exportMode.coverMode")}
                  </Button>
                  <Button
                    size="sm"
                    className="bg-zinc-100 text-zinc-950 hover:bg-zinc-100/90"
                    onClick={exportActiveClip}
                    disabled={isExporting || !hasSourcePath}
                  >
                    <DownloadIcon className="size-4" />
                    {t("exportMode.exportOne")}
                  </Button>
                </div>
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-zinc-500">{t("exportMode.nameLabel")}</p>
                    <Button
                      size="xs"
                      variant="outline"
                      className="border-white/14 bg-transparent text-zinc-300 hover:bg-white/8"
                      onClick={() => generateTitle(activeClip)}
                    >
                      <TypeIcon className="size-3.5" />
                      {t("exportMode.generate")}
                    </Button>
                  </div>
                  <Input
                    value={activeDraft.title}
                    onChange={(event) =>
                      updateMetadataField(activeClip.id, "title", event.target.value)
                    }
                    className="border-white/12 bg-black/22"
                    placeholder={t("exportMode.namePlaceholder")}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-zinc-500">{t("exportMode.tagsLabel")}</p>
                    <Button
                      size="xs"
                      variant="outline"
                      className="border-white/14 bg-transparent text-zinc-300 hover:bg-white/8"
                      onClick={() => generateTags(activeClip)}
                    >
                      <TagIcon className="size-3.5" />
                      {t("exportMode.pickTags")}
                    </Button>
                  </div>
                  <Input
                    value={activeDraft.tags}
                    onChange={(event) =>
                      updateMetadataField(activeClip.id, "tags", event.target.value)
                    }
                    className="border-white/12 bg-black/22"
                    placeholder={t("exportMode.tagsPlaceholder")}
                  />
                </div>
              </div>

              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-zinc-500">{t("exportMode.descriptionLabel")}</p>
                  <Button
                    size="xs"
                    variant="outline"
                    className="border-white/14 bg-transparent text-zinc-300 hover:bg-white/8"
                    onClick={() => generateDescription(activeClip)}
                  >
                    <SparklesIcon className="size-3.5" />
                    {t("exportMode.generate")}
                  </Button>
                </div>
                <Textarea
                  value={activeDraft.description}
                  onChange={(event) =>
                    updateMetadataField(activeClip.id, "description", event.target.value)
                  }
                  className="min-h-[92px] border-white/12 bg-black/22"
                  placeholder={t("exportMode.descriptionPlaceholder")}
                />
              </div>

              <div className="mt-3">
                <p className="text-xs text-zinc-500">{t("exportMode.platformsLabel")}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {ai.platformPresets.map((preset) => {
                    const selected = activeDraft.platformIds.includes(preset.id)
                    return (
                      <button
                        key={preset.id}
                        onClick={() => togglePlatformForClip(activeClip.id, preset.id)}
                        className={[
                          "rounded-md border px-2.5 py-1.5 text-xs transition",
                          selected
                            ? "border-zinc-200/40 bg-zinc-100/12 text-zinc-100"
                            : "border-white/10 bg-white/6 text-zinc-300 hover:border-white/20",
                        ].join(" ")}
                      >
                        {preset.name} · {preset.aspect}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="mt-3 grid gap-2 lg:grid-cols-2">
                {activeDraft.platformIds.map((platformId) => {
                  const preset = platformById.get(platformId)
                  if (!preset) {
                    return null
                  }
                  const cover = activeDraft.platformCovers[platformId]
                  const template = resolveTemplate(ai.thumbnailTemplates, cover?.templateId ?? null)
                  const previewTitle = activeDraft.title.trim() || activeClip.title
                  const previewSubtitle = template?.overlaySubtitle || projectName
                  const uploadKey = `${activeClip.id}:${platformId}`
                  const ratio = parseAspectRatio(preset.aspect)
                  const coverPreview = toCoverPreviewUrl(cover?.customCoverPath ?? null, webBlobMap)

                  return (
                    <article
                      key={platformId}
                      className="rounded-lg border border-white/10 bg-black/22 p-2.5"
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-xs text-zinc-200">
                          {preset.name} · {preset.aspect}
                        </p>
                        <span className="text-[11px] text-zinc-500">{preset.maxDuration}</span>
                      </div>

                      <div
                        className="relative overflow-hidden rounded-md border border-white/12"
                        style={{ aspectRatio: ratio }}
                      >
                        {cover?.coverMode === "custom" && coverPreview ? (
                          <img
                            src={coverPreview}
                            alt={t("exportMode.coverAlt", { platform: preset.name })}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div
                            className="h-full w-full"
                            style={{
                              background: `linear-gradient(130deg, ${template?.palette[0] ?? "#d8dfec"} 0%, ${template?.palette[1] ?? "#6f7992"} 100%)`,
                            }}
                          />
                        )}
                        <div className="absolute inset-x-2 bottom-2 rounded-sm border border-white/16 bg-black/58 px-2 py-1">
                          <p className="line-clamp-2 text-[11px] font-medium text-zinc-100">
                            {previewTitle}
                          </p>
                          <p className="line-clamp-1 text-[10px] text-zinc-300/85">{previewSubtitle}</p>
                        </div>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Button
                          size="xs"
                          variant="outline"
                          className="border-white/14 bg-transparent text-zinc-300 hover:bg-white/8"
                          onClick={() => setGeneratedCover(activeClip.id, platformId)}
                        >
                          <RefreshCcwIcon className="size-3.5" />
                          {t("exportMode.generate")}
                        </Button>
                        <Button
                          size="xs"
                          variant="outline"
                          className="border-white/14 bg-transparent text-zinc-300 hover:bg-white/8"
                          onClick={() => void openUploadPicker(activeClip.id, platformId)}
                        >
                          <UploadIcon className="size-3.5" />
                          {t("exportMode.useCustomCover")}
                        </Button>
                        {cover?.coverMode === "custom" ? (
                          <Button
                            size="xs"
                            variant="outline"
                            className="border-white/14 bg-transparent text-zinc-300 hover:bg-white/8"
                            onClick={() => removeCustomCover(activeClip.id, platformId)}
                          >
                            {t("exportMode.resetCover")}
                          </Button>
                        ) : null}
                        {!isTauriRuntime() ? (
                          <input
                            ref={(node) => {
                              uploadInputRefs.current[uploadKey] = node
                            }}
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            className="hidden"
                            onChange={(event) => {
                              onUploadCustomCoverWeb(activeClip.id, platformId, event.target.files?.[0] ?? null)
                              event.currentTarget.value = ""
                            }}
                          />
                        ) : null}
                      </div>

                      <p className="mt-1.5 flex items-center gap-1 text-[11px] text-zinc-500">
                        <ImageIcon className="size-3.5" />
                        {cover?.coverMode === "custom"
                          ? cover.customCoverName || t("exportMode.customCoverLabel")
                          : t("exportMode.templateLabel", { name: template?.name ?? t("exportMode.templateNotSelected") })}
                      </p>
                    </article>
                  )
                })}
              </div>
            </article>
          ) : null}
        </section>
      </div>
    </div>
  )
}
