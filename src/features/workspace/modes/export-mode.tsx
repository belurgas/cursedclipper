import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { convertFileSrc } from "@tauri-apps/api/core"
import {
  DownloadIcon,
  FolderOpenIcon,
  ImageIcon,
  RefreshCcwIcon,
  SparklesIcon,
  TagIcon,
  TypeIcon,
  UploadIcon,
} from "lucide-react"

import { formatSeconds } from "@/app/mock-data"
import type {
  ClipSegment,
  ExportClipDraft,
  PlatformPreset,
  ThumbnailTemplate,
} from "@/app/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { WorkspaceController } from "@/features/workspace/workspace-controller-types"
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

  return {
    title: clip.title,
    description: `Клип ${formatSeconds(clip.start)}-${formatSeconds(clip.end)}. Ключевой фрагмент для короткого формата.`,
    tags: "",
    platformIds: defaultPlatformIds,
    platformCovers,
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

export default function ExportMode({
  controller,
  projectId,
  projectName,
  sourcePath,
  onOpenCoverMode,
}: ExportModeProps) {
  const { clips, actions, activeClipId, ai, transcript, exports } = controller
  const { pushToast } = useAppToast()
  const uploadInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const objectUrlsRef = useRef<Set<string>>(new Set())
  const [isExporting, setIsExporting] = useState(false)
  const [webBlobMap, setWebBlobMap] = useState<Record<string, string>>({})

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

  const buildClipDraft = useCallback(
    (clip: ClipSegment, existing?: ExportClipDraft): ExportClipDraft => {
      if (!existing) {
        return makeDefaultDraft(clip, ai.platformPresets, defaultPlatformIds, defaultTemplateId)
      }

      const merged = makeDefaultDraft(clip, ai.platformPresets, defaultPlatformIds, defaultTemplateId)
      const safePlatformIds = existing.platformIds.filter((id) => validPlatformIdSet.has(id))

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
        platformIds: safePlatformIds.length > 0 ? safePlatformIds : merged.platformIds,
      }
    },
    [ai.platformPresets, defaultPlatformIds, defaultTemplateId, validPlatformIdSet],
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
        title: "Шаблоны недоступны",
        description: "Сначала сгенерируйте обложки в соответствующем режиме.",
        tone: "info",
        durationMs: 2800,
      })
      return
    }
    updateDraft(clipId, (draft) => {
      const current = draft.platformCovers[presetId]
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
    if (current?.customCoverPath?.startsWith("blob:")) {
      const blobUrl = webBlobMap[current.customCoverPath]
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl)
        objectUrlsRef.current.delete(blobUrl)
      }
      setWebBlobMap((previous) => {
        const next = { ...previous }
        delete next[current.customCoverPath!]
        return next
      })
    }
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
      : `${projectName}. Фрагмент ${formatSeconds(clip.start)}-${formatSeconds(clip.end)} с ключевой мыслью спикера.`
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
        title: "Нет исходного видео",
        description: "Для экспорта нужен импортированный файл проекта.",
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
        tasks.push({
          clipId: clip.id,
          platformId: preset.id,
          aspect: preset.aspect,
          start: clip.start,
          end: clip.end,
          title: draft.title.trim() || clip.title,
          description: draft.description.trim() || null,
          tags: draft.tags.trim() || null,
          coverPath,
        })
      }
    }
    if (tasks.length === 0) {
      pushToast({
        title: "Нечего экспортировать",
        description: "Выберите платформы хотя бы для одного клипа.",
        tone: "info",
        durationMs: 2800,
      })
      return null
    }

    return {
      projectId,
      projectName,
      sourcePath: trimmedSourcePath,
      taskId: `clip-export:${projectId}`,
      tasks,
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
        title: "Экспорт завершен",
        description: `Готово файлов: ${result.exportedCount}. Открыть папку экспорта?`,
        tone: "success",
        durationMs: 3400,
      })
      if (result.projectDir) {
        void openPathInFileManager(result.projectDir).catch(() => {})
      }
    } catch (error) {
      pushToast({
        title: "Ошибка экспорта",
        description: error instanceof Error ? error.message : "Не удалось выполнить экспорт.",
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
        <p className="text-sm">Создайте хотя бы один клип, чтобы открыть экспорт.</p>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-x-hidden overflow-y-auto pr-1 pb-2">
      <div className="rounded-xl border border-white/10 bg-black/24 px-3 py-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-xs tracking-[0.15em] text-zinc-500 uppercase">Экспорт клипов</p>
            <p className="mt-1 text-xs text-zinc-400">
              Для каждого клипа настройте метаданные, платформы и отдельные обложки по каждой платформе.
            </p>
          </div>
          <Button
            size="sm"
            className="bg-zinc-100 text-zinc-950 hover:bg-zinc-100/90"
            onClick={exportAllClips}
            disabled={isExporting || !sourcePath}
          >
            <FolderOpenIcon className="size-4" />
            Экспортировать всё
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(250px,0.7fr)_minmax(0,1fr)]">
        <section className="min-h-0 rounded-xl border border-white/10 bg-black/24 p-2.5">
          <p className="mb-2 text-xs tracking-[0.14em] text-zinc-500 uppercase">Клипы проекта</p>
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
                    Платформ: {selectedCount} · Обложки: {readyCount}/{selectedCount}
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
                    Режим обложек
                  </Button>
                  <Button
                    size="sm"
                    className="bg-zinc-100 text-zinc-950 hover:bg-zinc-100/90"
                    onClick={exportActiveClip}
                    disabled={isExporting || !sourcePath}
                  >
                    <DownloadIcon className="size-4" />
                    Экспортировать
                  </Button>
                </div>
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-zinc-500">Название</p>
                    <Button
                      size="xs"
                      variant="outline"
                      className="border-white/14 bg-transparent text-zinc-300 hover:bg-white/8"
                      onClick={() => generateTitle(activeClip)}
                    >
                      <TypeIcon className="size-3.5" />
                      Сгенерировать
                    </Button>
                  </div>
                  <Input
                    value={activeDraft.title}
                    onChange={(event) =>
                      updateMetadataField(activeClip.id, "title", event.target.value)
                    }
                    className="border-white/12 bg-black/22"
                    placeholder="Название клипа"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-zinc-500">Теги</p>
                    <Button
                      size="xs"
                      variant="outline"
                      className="border-white/14 bg-transparent text-zinc-300 hover:bg-white/8"
                      onClick={() => generateTags(activeClip)}
                    >
                      <TagIcon className="size-3.5" />
                      Подобрать
                    </Button>
                  </div>
                  <Input
                    value={activeDraft.tags}
                    onChange={(event) =>
                      updateMetadataField(activeClip.id, "tags", event.target.value)
                    }
                    className="border-white/12 bg-black/22"
                    placeholder="#тег1 #тег2 #тег3"
                  />
                </div>
              </div>

              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-zinc-500">Описание</p>
                  <Button
                    size="xs"
                    variant="outline"
                    className="border-white/14 bg-transparent text-zinc-300 hover:bg-white/8"
                    onClick={() => generateDescription(activeClip)}
                  >
                    <SparklesIcon className="size-3.5" />
                    Сгенерировать
                  </Button>
                </div>
                <Textarea
                  value={activeDraft.description}
                  onChange={(event) =>
                    updateMetadataField(activeClip.id, "description", event.target.value)
                  }
                  className="min-h-[92px] border-white/12 bg-black/22"
                  placeholder="Описание для публикации"
                />
              </div>

              <div className="mt-3">
                <p className="text-xs text-zinc-500">Платформы экспорта</p>
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
                            alt={`Обложка ${preset.name}`}
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
                          Сгенерировать
                        </Button>
                        <Button
                          size="xs"
                          variant="outline"
                          className="border-white/14 bg-transparent text-zinc-300 hover:bg-white/8"
                          onClick={() => void openUploadPicker(activeClip.id, platformId)}
                        >
                          <UploadIcon className="size-3.5" />
                          Поставить свою
                        </Button>
                        {cover?.coverMode === "custom" ? (
                          <Button
                            size="xs"
                            variant="outline"
                            className="border-white/14 bg-transparent text-zinc-300 hover:bg-white/8"
                            onClick={() => removeCustomCover(activeClip.id, platformId)}
                          >
                            Сброс
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
                          ? cover.customCoverName || "Пользовательская обложка"
                          : `Шаблон: ${template?.name ?? "не выбран"}`}
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
