import { useEffect, useMemo, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  CheckCircle2Icon,
  DownloadCloudIcon,
  Link2Icon,
  UploadIcon,
  WandSparklesIcon,
} from "lucide-react"

import type { Project } from "@/app/types"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  createProjectDraftViaBackend,
  downloadYoutubeMedia,
  pickLocalVideoFile,
  probeYoutubeFormats,
  stageLocalVideoFile,
  type YoutubeFormatOption,
  type YoutubeProbeResult,
} from "@/shared/tauri/backend"
import { isTauriRuntime } from "@/shared/tauri/runtime"
import { useAppToast } from "@/shared/ui/app-toast-provider"

type CreateProjectDialogProps = {
  onCreate: (project: Project) => void
  onUpdateProject: (projectId: string, patch: Partial<Project>) => void
}

type SourceMode = "local" | "youtube"
type AudioPreference = "with-audio" | "without-audio"

type FormState = {
  name: string
  description: string
}

const initialForm: FormState = {
  name: "",
  description: "",
}

function formatSize(bytes?: number | null) {
  if (!bytes || bytes <= 0) {
    return "Размер неизвестен"
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileNameFromPath(path: string) {
  const normalized = path.replaceAll("\\", "/")
  const chunks = normalized.split("/")
  return chunks[chunks.length - 1] || path
}

function normalizeWindowsExtendedPath(path: string) {
  const trimmed = path.trim()
  if (trimmed.startsWith("\\\\?\\UNC\\")) {
    return `\\\\${trimmed.slice("\\\\?\\UNC\\".length)}`
  }
  if (trimmed.startsWith("\\\\?\\")) {
    return trimmed.slice("\\\\?\\".length)
  }
  return trimmed
}

function resolutionHeight(resolution: string) {
  const matrixMatch = resolution.match(/(\d{3,5})\s*x\s*(\d{3,5})/i)
  if (matrixMatch) {
    return Number(matrixMatch[2] ?? 0)
  }
  const progressiveMatch = resolution.match(/(\d{3,5})\s*p/i)
  if (progressiveMatch) {
    return Number(progressiveMatch[1] ?? 0)
  }
  return 0
}

function dedupeFormatsByResolution(
  formats: YoutubeFormatOption[],
  preferWithAudio: boolean,
): YoutubeFormatOption[] {
  const sorted = [...formats].sort((left, right) => {
    const leftScore =
      resolutionHeight(left.resolution) * 10_000 +
      (left.fps ?? 0) * 100 +
      (left.ext === "mp4" ? 4_000 : 0) +
      (preferWithAudio
        ? left.videoOnly
          ? -2_000
          : 3_000
        : left.videoOnly
          ? 3_000
          : -2_000)
    const rightScore =
      resolutionHeight(right.resolution) * 10_000 +
      (right.fps ?? 0) * 100 +
      (right.ext === "mp4" ? 4_000 : 0) +
      (preferWithAudio
        ? right.videoOnly
          ? -2_000
          : 3_000
        : right.videoOnly
          ? 3_000
          : -2_000)
    return rightScore - leftScore
  })
  const grouped = new Map<string, YoutubeFormatOption>()
  for (const item of sorted) {
    const key = item.resolution || "auto"
    if (!grouped.has(key)) {
      grouped.set(key, item)
    }
  }
  return [...grouped.values()].sort(
    (left, right) => resolutionHeight(right.resolution) - resolutionHeight(left.resolution),
  )
}

export function CreateProjectDialog({ onCreate, onUpdateProject }: CreateProjectDialogProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const { pushToast } = useAppToast()
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [succeeded, setSucceeded] = useState(false)
  const [form, setForm] = useState<FormState>(initialForm)
  const [touched, setTouched] = useState(false)

  const [sourceMode, setSourceMode] = useState<SourceMode>("local")
  const [localFile, setLocalFile] = useState<File | null>(null)
  const [localFilePath, setLocalFilePath] = useState<string | null>(null)
  const [youtubeUrl, setYoutubeUrl] = useState("")
  const [probeLoading, setProbeLoading] = useState(false)
  const [probeResult, setProbeResult] = useState<YoutubeProbeResult | null>(null)
  const [probeError, setProbeError] = useState<string | null>(null)
  const [selectedFormatId, setSelectedFormatId] = useState<string>("")
  const [audioPreference, setAudioPreference] = useState<AudioPreference>("with-audio")
  const [downloadOnCreate, setDownloadOnCreate] = useState(true)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const selectableFormats = useMemo(() => {
    if (!probeResult) {
      return []
    }
    const containerVideoFormats = probeResult.formats.filter(
      (format) =>
        !format.audioOnly &&
        ["mp4", "webm", "mkv", "mov", "m4v"].includes(format.ext.toLowerCase()),
    )
    const withoutAudioCandidates = containerVideoFormats.filter((format) => format.videoOnly)

    if (audioPreference === "without-audio") {
      return dedupeFormatsByResolution(withoutAudioCandidates, false)
    }

    if (containerVideoFormats.length > 0) {
      return dedupeFormatsByResolution(containerVideoFormats, true)
    }
    return dedupeFormatsByResolution(withoutAudioCandidates, true)
  }, [audioPreference, probeResult])

  const selectedFormat = useMemo(
    () => selectableFormats.find((format) => format.id === selectedFormatId) ?? null,
    [selectableFormats, selectedFormatId],
  )

  const validation = useMemo(() => {
    const nameError =
      form.name.trim().length < 3 ? "Название проекта должно быть не короче 3 символов." : ""
    const descriptionError =
      form.description.trim().length < 12
        ? "Добавьте короткий бриф (не менее 12 символов), чтобы ИИ задал контекст."
        : ""
    const sourceError =
      sourceMode === "local"
        ? localFile || localFilePath
          ? ""
          : "Выберите видеофайл с устройства."
        : selectedFormatId
          ? ""
          : "Проверьте ссылку и выберите формат для импорта."
    return {
      nameError,
      descriptionError,
      sourceError,
      valid: !nameError && !descriptionError && !sourceError,
    }
  }, [form.description, form.name, localFile, localFilePath, selectedFormatId, sourceMode])

  useEffect(() => {
    if (!probeResult) {
      return
    }
    if (selectableFormats.length === 0) {
      setSelectedFormatId("")
      return
    }
    const exists = selectableFormats.some((format) => format.id === selectedFormatId)
    if (!exists) {
      setSelectedFormatId(selectableFormats[0].id)
    }
  }, [probeResult, selectableFormats, selectedFormatId])

  const reset = () => {
    setForm(initialForm)
    setTouched(false)
    setSubmitting(false)
    setSucceeded(false)
    setSourceMode("local")
    setLocalFile(null)
    setLocalFilePath(null)
    setYoutubeUrl("")
    setProbeLoading(false)
    setProbeResult(null)
    setProbeError(null)
    setSelectedFormatId("")
    setAudioPreference("with-audio")
    setDownloadOnCreate(true)
    setSubmitError(null)
  }

  const runYoutubeProbe = async () => {
    const trimmedUrl = youtubeUrl.trim()
    if (!trimmedUrl) {
      setProbeError("Вставьте ссылку на YouTube.")
      return
    }

    setProbeLoading(true)
    setProbeError(null)
    setProbeResult(null)
    setSelectedFormatId("")
    setAudioPreference("with-audio")
    try {
      const payload = await probeYoutubeFormats(trimmedUrl)
      setProbeResult(payload)
    } catch (error) {
      setProbeError(error instanceof Error ? error.message : "Не удалось получить форматы.")
    } finally {
      setProbeLoading(false)
    }
  }

  const handleSubmit = async () => {
    setTouched(true)
    setSubmitError(null)
    if (!validation.valid || submitting) {
      return
    }
    setSubmitting(true)

    try {
      let sourcePayload: {
        sourceType: "local" | "youtube"
        sourceLabel: string
        sourceUrl?: string
        sourceStatus: "pending" | "ready" | "failed"
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

      const trimmedName = form.name.trim()
      const trimmedDescription = form.description.trim()
      const trimmedYoutubeUrl = youtubeUrl.trim()

      if (sourceMode === "local") {
        const localImportedPath = localFilePath?.trim() || undefined
        const stagedLocalPath = localImportedPath
          ? await stageLocalVideoFile(localImportedPath, trimmedName)
          : undefined
        const localSourceUrl =
          !stagedLocalPath && localFile ? URL.createObjectURL(localFile) : undefined
        const localLabel = stagedLocalPath
          ? fileNameFromPath(stagedLocalPath)
          : localFile?.name ?? "Локальный файл"
        sourcePayload = {
          sourceType: "local",
          sourceLabel: localLabel,
          sourceUrl: localSourceUrl,
          sourceStatus: stagedLocalPath || localSourceUrl ? "ready" : "pending",
          importedMediaPath: stagedLocalPath,
        }
      } else {
        sourcePayload = {
          sourceType: "youtube",
          sourceLabel: probeResult?.title || "YouTube import",
          sourceUrl: trimmedYoutubeUrl,
          sourceStatus: "pending",
          sourceUploader: probeResult?.uploader ?? undefined,
          sourceDurationSeconds: probeResult?.duration
            ? Math.max(0, Math.round(probeResult.duration))
            : undefined,
          sourceThumbnail: probeResult?.thumbnail ?? undefined,
          sourceViewCount: probeResult?.viewCount ?? undefined,
          sourceLikeCount: probeResult?.likeCount ?? undefined,
          sourceCommentCount: probeResult?.commentCount ?? undefined,
          sourceUploadDate: probeResult?.uploadDate ?? undefined,
          sourceChannelId: probeResult?.channelId ?? undefined,
          sourceChannelUrl: probeResult?.channelUrl ?? undefined,
          sourceChannelFollowers: probeResult?.channelFollowers ?? undefined,
        }
      }

      const project = await createProjectDraftViaBackend(
        trimmedName,
        trimmedDescription,
        sourcePayload,
      )
      onCreate(project)

      if (sourceMode === "youtube" && downloadOnCreate) {
        const inferredDuration = probeResult?.duration
          ? Math.max(0, Math.round(probeResult.duration))
          : undefined
        void downloadYoutubeMedia({
          url: trimmedYoutubeUrl,
          formatId: selectedFormatId,
          videoOnly: selectedFormat?.videoOnly ?? false,
          audioOnly: selectedFormat?.audioOnly ?? false,
          includeAudio: audioPreference === "with-audio",
          projectName: trimmedName,
          taskId: `youtube-download:${project.id}`,
        })
          .then((downloadResult) => {
            const outputPath = normalizeWindowsExtendedPath(downloadResult.outputPath)
            const resolvedDuration =
              downloadResult.durationSeconds ?? inferredDuration ?? project.durationSeconds
            onUpdateProject(project.id, {
              sourceStatus: "ready",
              importedMediaPath: outputPath,
              sourceUrl: downloadResult.sourceUrl,
              sourceLabel: probeResult?.title || "YouTube import",
              durationSeconds: resolvedDuration,
              sourceDurationSeconds: resolvedDuration,
              sourceUploader: probeResult?.uploader ?? undefined,
              sourceThumbnail: probeResult?.thumbnail ?? undefined,
              sourceViewCount: probeResult?.viewCount ?? undefined,
              sourceLikeCount: probeResult?.likeCount ?? undefined,
              sourceCommentCount: probeResult?.commentCount ?? undefined,
              sourceUploadDate: probeResult?.uploadDate ?? undefined,
              sourceChannelId: probeResult?.channelId ?? undefined,
              sourceChannelUrl: probeResult?.channelUrl ?? undefined,
              sourceChannelFollowers: probeResult?.channelFollowers ?? undefined,
            })
          })
          .catch((error) => {
            onUpdateProject(project.id, {
              sourceStatus: "failed",
            })
            console.error("Youtube import failed:", error)
          })
      } else if (sourceMode === "youtube") {
        pushToast({
          title: "Проект создан",
          description: "Источник добавлен как YouTube-ссылка. Скачивание можно запустить позже.",
          tone: "info",
          durationMs: 3400,
        })
      }

      setSucceeded(true)

      window.setTimeout(() => {
        setOpen(false)
        reset()
      }, 420)
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Не удалось создать проект.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value)
        if (!value) {
          reset()
        }
      }}
    >
      <DialogTrigger asChild>
        <Button className="bg-zinc-100 text-zinc-950 hover:bg-zinc-100/90">
          <WandSparklesIcon className="size-4" />
          Создать проект
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[86vh] max-w-3xl overflow-y-auto border-white/12 bg-[#090b10]/95">
        <AnimatePresence mode="wait" initial={false}>
          {succeeded ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.32 }}
              className="grid gap-4 py-8 text-center"
            >
              <CheckCircle2Icon className="mx-auto size-10 text-zinc-300" />
              <div>
                <h3 className="text-lg font-semibold text-zinc-100">Проект создан</h3>
                <p className="mt-1 text-sm text-zinc-400">
                  Источник подключен. Можно переходить к монтажу.
                </p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
            >
              <DialogHeader>
                <DialogTitle>Новый проект</DialogTitle>
                <DialogDescription>
                  Выберите источник, проверьте формат и запустите рабочее пространство.
                </DialogDescription>
              </DialogHeader>

              <div className="mt-4 space-y-3">
                <p className="text-xs tracking-[0.18em] text-zinc-500 uppercase">Источник видео</p>
                <div className="grid gap-2 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setSourceMode("local")}
                    className={[
                      "rounded-xl border px-3 py-2 text-left transition",
                      sourceMode === "local"
                        ? "border-zinc-200/35 bg-zinc-100/10 text-zinc-100"
                        : "border-white/10 bg-white/6 text-zinc-400 hover:border-white/20 hover:text-zinc-200",
                    ].join(" ")}
                  >
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <UploadIcon className="size-4" />
                      Видео с устройства
                    </p>
                    <p className="mt-1 text-xs opacity-80">
                      Локальный файл для быстрого старта.
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSourceMode("youtube")}
                    className={[
                      "rounded-xl border px-3 py-2 text-left transition",
                      sourceMode === "youtube"
                        ? "border-zinc-200/35 bg-zinc-100/10 text-zinc-100"
                        : "border-white/10 bg-white/6 text-zinc-400 hover:border-white/20 hover:text-zinc-200",
                    ].join(" ")}
                  >
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <Link2Icon className="size-4" />
                      Ссылка YouTube
                    </p>
                    <p className="mt-1 text-xs opacity-80">
                      Анализ доступных форматов до скачивания.
                    </p>
                  </button>
                </div>
              </div>

              {sourceMode === "local" ? (
                <div className="mt-3 rounded-xl border border-white/10 bg-black/24 p-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null
                      setLocalFile(file)
                      setLocalFilePath(null)
                    }}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-zinc-100">
                        {localFilePath
                          ? fileNameFromPath(localFilePath)
                          : localFile
                            ? localFile.name
                            : "Файл не выбран"}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {localFilePath
                          ? localFilePath
                          : localFile
                            ? `Размер: ${(localFile.size / (1024 * 1024)).toFixed(1)} MB`
                            : "Поддерживаются видеофайлы с устройства."}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      className="border-white/15 bg-transparent text-zinc-200 hover:bg-white/8"
                      onClick={() => {
                        if (isTauriRuntime()) {
                          setSubmitError(null)
                          void pickLocalVideoFile()
                            .then((path) => {
                              if (!path) {
                                return
                              }
                              setLocalFilePath(path)
                              setLocalFile(null)
                            })
                            .catch((error) => {
                              setSubmitError(
                                error instanceof Error
                                  ? error.message
                                  : "Не удалось выбрать локальный файл.",
                              )
                            })
                          return
                        }
                        fileInputRef.current?.click()
                      }}
                    >
                      <UploadIcon className="size-4" />
                      Выбрать файл
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 space-y-3 rounded-xl border border-white/10 bg-black/24 p-3">
                  <div className="flex flex-col gap-2 md:flex-row">
                    <Input
                      value={youtubeUrl}
                      onChange={(event) => setYoutubeUrl(event.target.value)}
                      placeholder="https://www.youtube.com/watch?v=..."
                      className="border-white/12 bg-black/20"
                    />
                    <Button
                      type="button"
                      className="bg-zinc-100 text-zinc-950 hover:bg-zinc-100/90"
                      onClick={() => {
                        void runYoutubeProbe()
                      }}
                      disabled={probeLoading}
                    >
                      {probeLoading ? "Проверка..." : "Проверить форматы"}
                    </Button>
                  </div>

                  {probeError ? (
                    <div className="rounded-lg border border-rose-300/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
                      {probeError}
                    </div>
                  ) : null}

                  {probeResult ? (
                    <div className="space-y-2">
                      <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                        <p className="text-sm font-medium text-zinc-100">{probeResult.title}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  {probeResult.uploader ?? "Канал не определен"}
                </p>
                {probeResult.duration ? (
                  <p className="mt-1 text-xs text-zinc-500">
                    Длительность: {Math.round(probeResult.duration)} c
                  </p>
                ) : null}
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => setAudioPreference("with-audio")}
                          className={[
                            "rounded-lg border px-3 py-2 text-left text-sm transition",
                            audioPreference === "with-audio"
                              ? "border-zinc-200/35 bg-zinc-100/10 text-zinc-100"
                              : "border-white/10 bg-white/6 text-zinc-400 hover:text-zinc-200",
                          ].join(" ")}
                        >
                          С аудио
                        </button>
                        <button
                          type="button"
                          onClick={() => setAudioPreference("without-audio")}
                          className={[
                            "rounded-lg border px-3 py-2 text-left text-sm transition",
                            audioPreference === "without-audio"
                              ? "border-zinc-200/35 bg-zinc-100/10 text-zinc-100"
                              : "border-white/10 bg-white/6 text-zinc-400 hover:text-zinc-200",
                          ].join(" ")}
                        >
                          Без аудио
                        </button>
                      </div>
                      {audioPreference === "with-audio" &&
                      selectableFormats.length > 0 &&
                      selectableFormats.every((format) => format.videoOnly) ? (
                        <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-400">
                          Прямых MP4 форматов с аудио нет. Будет использован видео-поток и аудио
                          добавится автоматически при загрузке.
                        </div>
                      ) : null}
                      <div className="grid max-h-56 gap-2 overflow-y-auto pr-1">
                        {selectableFormats.map((format) => {
                          const active = selectedFormatId === format.id
                          return (
                            <button
                              key={format.id}
                              type="button"
                              onClick={() => setSelectedFormatId(format.id)}
                              className={[
                                "rounded-lg border px-3 py-2 text-left transition",
                                active
                                  ? "border-zinc-200/35 bg-zinc-100/10 text-zinc-100"
                                  : "border-white/10 bg-white/6 text-zinc-400 hover:border-white/20 hover:text-zinc-200",
                              ].join(" ")}
                            >
                              <p className="text-sm font-medium">
                                {format.resolution} • {format.ext.toUpperCase()} • {format.id}
                              </p>
                              <p className="mt-1 text-xs opacity-80">
                                {formatSize(format.filesize)} •{" "}
                                {format.videoOnly ? "Видео без аудио" : "Видео + аудио"} •{" "}
                                {format.fps ? `${Math.round(format.fps)} fps` : "fps n/a"}
                              </p>
                            </button>
                          )
                        })}
                      </div>
                      {selectableFormats.length === 0 ? (
                        <div className="rounded-lg border border-rose-300/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
                          Нет подходящих видеоформатов. Попробуйте другую ссылку или обновите
                          yt-dlp/FFmpeg.
                        </div>
                      ) : null}
                      <button
                        type="button"
                        className={[
                          "w-full rounded-lg border px-3 py-2 text-left text-sm transition",
                          downloadOnCreate
                            ? "border-zinc-200/35 bg-zinc-100/10 text-zinc-100"
                            : "border-white/10 bg-white/6 text-zinc-400 hover:text-zinc-200",
                        ].join(" ")}
                        onClick={() => setDownloadOnCreate((value) => !value)}
                      >
                        Скачивать видео сразу при создании проекта
                      </button>
                    </div>
                  ) : null}
                </div>
              )}

              <FieldGroup className="mt-4">
                <Field>
                  <FieldLabel htmlFor="project-name">Название проекта</FieldLabel>
                  <Input
                    id="project-name"
                    value={form.name}
                    onChange={(event) =>
                      setForm((previous) => ({ ...previous, name: event.target.value }))
                    }
                    placeholder="Например: Интервью основателя - выпуск 13"
                    className="border-white/12 bg-black/20"
                  />
                  <FieldError>{touched ? validation.nameError : ""}</FieldError>
                </Field>
                <Field>
                  <FieldLabel htmlFor="project-description">Бриф</FieldLabel>
                  <Textarea
                    id="project-description"
                    value={form.description}
                    onChange={(event) =>
                      setForm((previous) => ({
                        ...previous,
                        description: event.target.value,
                      }))
                    }
                    placeholder="Опишите цель, аудиторию и стиль нарезки."
                    className="min-h-24 border-white/12 bg-black/20"
                  />
                  <FieldDescription>
                    Бриф определяет стартовые рекомендации ИИ и сценарий публикации.
                  </FieldDescription>
                  <FieldError>{touched ? validation.descriptionError : ""}</FieldError>
                </Field>
              </FieldGroup>

              <FieldError>{touched ? validation.sourceError : ""}</FieldError>
              {submitError ? (
                <div className="mt-2 rounded-lg border border-rose-300/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
                  {submitError}
                </div>
              ) : null}

              <DialogFooter className="mt-5">
                <Button
                  variant="outline"
                  className="border-white/15 bg-transparent text-zinc-200 hover:bg-white/8"
                  onClick={() => setOpen(false)}
                >
                  Отмена
                </Button>
                <Button
                  onClick={() => {
                    void handleSubmit()
                  }}
                  disabled={submitting}
                  className="bg-zinc-100 text-zinc-950 hover:bg-zinc-100/90"
                >
                  {submitting ? (
                    <>
                      <DownloadCloudIcon className="size-4" />
                      Подготовка источника...
                    </>
                  ) : (
                    "Создать проект"
                  )}
                </Button>
              </DialogFooter>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  )
}
