import { useEffect, useMemo, useState } from "react"
import {
  ChevronDownIcon,
  ChevronUpIcon,
  CpuIcon,
  DownloadIcon,
  FolderOpenIcon,
  RefreshCcwIcon,
  SaveIcon,
  Settings2Icon,
  ShieldCheckIcon,
  WrenchIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  getRuntimeToolsStatus,
  installOrUpdateManagedFfmpeg,
  installOrUpdateManagedYtdlp,
  openProjectsRootDir,
  pickProjectsRootDir,
  saveRuntimeToolsSettings,
  type RuntimeToolsSettings,
  type RuntimeToolsStatus,
} from "@/shared/tauri/backend"

const modeOptions: Array<{
  id: RuntimeToolsSettings["ytdlpMode"]
  label: string
  hint: string
}> = [
  {
    id: "managed",
    label: "Managed (рекомендуется)",
    hint: "Приложение само устанавливает и обновляет yt-dlp без конфликтов.",
  },
  {
    id: "custom",
    label: "Custom path",
    hint: "Использовать ваш путь к бинарнику yt-dlp.",
  },
  {
    id: "system",
    label: "System",
    hint: "Использовать yt-dlp из PATH операционной системы.",
  },
]

function statusTone(available: boolean) {
  return available
    ? "border-emerald-300/20 bg-emerald-400/12 text-emerald-100"
    : "border-rose-300/20 bg-rose-400/12 text-rose-100"
}

type SettingsViewProps = {
  onRuntimeMessage?: (message: string) => void
  initialStatus?: RuntimeToolsStatus | null
  onStatusChange?: (status: RuntimeToolsStatus) => void
}

export function SettingsView({
  onRuntimeMessage,
  initialStatus = null,
  onStatusChange,
}: SettingsViewProps) {
  const [status, setStatus] = useState<RuntimeToolsStatus | null>(initialStatus)
  const [form, setForm] = useState<RuntimeToolsSettings | null>(initialStatus?.settings ?? null)
  const [loading, setLoading] = useState(!initialStatus)
  const [saving, setSaving] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [installingFfmpeg, setInstallingFfmpeg] = useState(false)
  const [pickingDir, setPickingDir] = useState(false)
  const [openingDir, setOpeningDir] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [errorText, setErrorText] = useState<string | null>(null)

  const applyStatus = (payload: RuntimeToolsStatus) => {
    setStatus(payload)
    setForm(payload.settings)
    onStatusChange?.(payload)
  }

  const loadStatus = async (silent = false) => {
    if (!silent) {
      setLoading(true)
    }
    setErrorText(null)
    try {
      const payload = await getRuntimeToolsStatus()
      applyStatus(payload)
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Не удалось загрузить настройки.")
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    if (initialStatus) {
      applyStatus(initialStatus)
      setLoading(false)
      void loadStatus(true)
      return
    }
    void loadStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const changed = useMemo(() => {
    if (!status || !form) {
      return false
    }
    return JSON.stringify(status.settings) !== JSON.stringify(form)
  }, [form, status])

  useEffect(() => {
    if (!form || !status) {
      return
    }
    if (form.ytdlpMode === "system" && !status.ytdlpSystemAvailable) {
      setForm((previous) => (previous ? { ...previous, ytdlpMode: "managed" } : previous))
    }
  }, [form, status])

  const visibleModeOptions = useMemo(
    () =>
      modeOptions.filter(
        (option) => option.id !== "system" || Boolean(status?.ytdlpSystemAvailable),
      ),
    [status?.ytdlpSystemAvailable],
  )

  return (
    <div className="space-y-4">
      <Card className="glass-panel border-white/12 bg-white/3 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-zinc-100">
            <Settings2Icon className="size-4 text-zinc-300" />
            Runtime и инструменты
          </CardTitle>
          <p className="text-sm text-zinc-400">
            Статус FFmpeg, FFprobe и yt-dlp для импорта и обработки видео.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 md:grid-cols-3">
            {[status?.ffmpeg, status?.ffprobe, status?.ytdlp].filter(Boolean).map((tool) => (
              <article
                key={tool?.name}
                className={["rounded-xl border p-3", statusTone(Boolean(tool?.available))].join(" ")}
              >
                <p className="text-sm font-medium">{tool?.name}</p>
                <p className="mt-1 text-xs opacity-80">
                  {tool?.available ? tool?.version ?? "Готово" : tool?.message ?? "Не найден"}
                </p>
                <p className="mt-1 text-[11px] opacity-70">Источник: {tool?.source ?? "unknown"}</p>
              </article>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="border-white/15 bg-transparent text-zinc-200 hover:bg-white/8"
              onClick={() => {
                void loadStatus()
              }}
              disabled={loading}
            >
              <RefreshCcwIcon className="size-4" />
              Обновить статусы
            </Button>
            <Button
              className="bg-zinc-100 text-zinc-950 hover:bg-zinc-100/90"
              onClick={() => {
                setInstalling(true)
                setErrorText(null)
                void installOrUpdateManagedYtdlp()
                  .then(async () => {
                    onRuntimeMessage?.("yt-dlp установлен/обновлён.")
                    await loadStatus(true)
                  })
                  .catch((error) => {
                    setErrorText(error instanceof Error ? error.message : "Ошибка установки yt-dlp.")
                  })
                  .finally(() => setInstalling(false))
              }}
              disabled={installing}
            >
              <DownloadIcon className="size-4" />
              {installing ? "Установка..." : "Установить / обновить yt-dlp"}
            </Button>
            <Button
              className="bg-zinc-100/12 text-zinc-100 hover:bg-zinc-100/18"
              onClick={() => {
                setInstallingFfmpeg(true)
                setErrorText(null)
                void installOrUpdateManagedFfmpeg()
                  .then(async () => {
                    onRuntimeMessage?.("FFmpeg и FFprobe установлены/обновлены.")
                    await loadStatus(true)
                  })
                  .catch((error) => {
                    setErrorText(error instanceof Error ? error.message : "Ошибка установки FFmpeg.")
                  })
                  .finally(() => setInstallingFfmpeg(false))
              }}
              disabled={installingFfmpeg}
            >
              <WrenchIcon className="size-4" />
              {installingFfmpeg ? "Установка FFmpeg..." : "Установить / обновить FFmpeg"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-panel border-white/12 bg-white/3 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-zinc-100">
            <CpuIcon className="size-4 text-zinc-300" />
            Конфигурация
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!form || !status ? (
            <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-zinc-400">
              {loading ? "Подготовка настроек..." : "Настройки пока недоступны."}
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <p className="text-xs tracking-[0.18em] text-zinc-500 uppercase">Режим yt-dlp</p>
                <div className="grid gap-2 md:grid-cols-3">
                  {visibleModeOptions.map((option) => {
                    const active = form.ytdlpMode === option.id
                    return (
                      <button
                        key={option.id}
                        type="button"
                        className={[
                          "rounded-xl border px-3 py-2 text-left transition",
                          active
                            ? "border-zinc-200/35 bg-zinc-100/12 text-zinc-100"
                            : "border-white/10 bg-white/6 text-zinc-400 hover:border-white/20 hover:text-zinc-200",
                        ].join(" ")}
                        onClick={() =>
                          setForm((previous) =>
                            previous ? { ...previous, ytdlpMode: option.id } : previous,
                          )
                        }
                      >
                        <p className="text-sm font-medium">{option.label}</p>
                        <p className="mt-1 text-xs opacity-80">{option.hint}</p>
                      </button>
                    )
                  })}
                </div>
                {!status.ytdlpSystemAvailable ? (
                  <p className="text-[11px] text-zinc-500">
                    Режим `System` скрыт, потому что yt-dlp не найден в PATH.
                  </p>
                ) : null}
              </div>

              <div className="rounded-xl border border-white/10 bg-black/24 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs tracking-[0.14em] text-zinc-500 uppercase">Папка проектов</p>
                    <p className="mt-1 text-xs text-zinc-400 break-all">
                      Активная папка: {status.projectsDir}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="xs"
                      variant="outline"
                      className="border-white/15 bg-transparent text-zinc-200 hover:bg-white/8"
                      disabled={pickingDir}
                      onClick={() => {
                        setPickingDir(true)
                        setErrorText(null)
                        void pickProjectsRootDir()
                          .then((path) => {
                            if (!path) {
                              return
                            }
                            setForm((previous) =>
                              previous ? { ...previous, projectsRootDir: path } : previous,
                            )
                          })
                          .catch((error) => {
                            setErrorText(error instanceof Error ? error.message : "Не удалось выбрать папку.")
                          })
                          .finally(() => setPickingDir(false))
                      }}
                    >
                      Выбрать папку
                    </Button>
                    <Button
                      size="xs"
                      variant="outline"
                      className="border-white/15 bg-transparent text-zinc-200 hover:bg-white/8"
                      disabled={openingDir}
                      onClick={() => {
                        setOpeningDir(true)
                        setErrorText(null)
                        void openProjectsRootDir()
                          .then((path) => {
                            onRuntimeMessage?.(`Открыта папка проектов: ${path}`)
                          })
                          .catch((error) => {
                            setErrorText(error instanceof Error ? error.message : "Не удалось открыть папку.")
                          })
                          .finally(() => setOpeningDir(false))
                      }}
                    >
                      <FolderOpenIcon className="size-3.5" />
                      Открыть
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      className="text-zinc-400 hover:bg-white/8 hover:text-zinc-200"
                      onClick={() =>
                        setForm((previous) =>
                          previous ? { ...previous, projectsRootDir: null } : previous,
                        )
                      }
                    >
                      По умолчанию
                    </Button>
                  </div>
                </div>
                <Input
                  value={form.projectsRootDir ?? ""}
                  onChange={(event) =>
                    setForm((previous) =>
                      previous ? { ...previous, projectsRootDir: event.target.value } : previous,
                    )
                  }
                  placeholder="Оставьте пустым для managed-пути приложения"
                  className="mt-2 border-white/12 bg-black/20 text-sm"
                />
                <p className="mt-1 text-[11px] text-zinc-500">
                  Пустое значение = managed-хранилище внутри приложения.
                </p>
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <button
                  type="button"
                  className={[
                    "rounded-lg border px-3 py-2 text-left text-sm transition",
                    form.autoUpdateYtdlp
                      ? "border-zinc-200/35 bg-zinc-100/10 text-zinc-100"
                      : "border-white/10 bg-white/6 text-zinc-400 hover:text-zinc-200",
                  ].join(" ")}
                  onClick={() =>
                    setForm((previous) =>
                      previous ? { ...previous, autoUpdateYtdlp: !previous.autoUpdateYtdlp } : previous,
                    )
                  }
                >
                  Автообновление yt-dlp
                </button>
                <button
                  type="button"
                  className={[
                    "rounded-lg border px-3 py-2 text-left text-sm transition",
                    form.preferBundledFfmpeg
                      ? "border-zinc-200/35 bg-zinc-100/10 text-zinc-100"
                      : "border-white/10 bg-white/6 text-zinc-400 hover:text-zinc-200",
                  ].join(" ")}
                  onClick={() =>
                    setForm((previous) =>
                      previous
                        ? { ...previous, preferBundledFfmpeg: !previous.preferBundledFfmpeg }
                        : previous,
                    )
                  }
                >
                  Предпочитать managed/bundled FFmpeg
                </button>
              </div>

              <button
                type="button"
                className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-black/22 px-3 py-2 text-left text-xs text-zinc-300 transition hover:bg-white/6"
                onClick={() => setShowAdvanced((value) => !value)}
              >
                <span>Расширенные пути (custom)</span>
                {showAdvanced ? <ChevronUpIcon className="size-4" /> : <ChevronDownIcon className="size-4" />}
              </button>

              {showAdvanced ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="space-y-1">
                    <p className="text-xs text-zinc-400">Путь к yt-dlp (custom)</p>
                    <Input
                      value={form.ytdlpCustomPath ?? ""}
                      onChange={(event) =>
                        setForm((previous) =>
                          previous
                            ? { ...previous, ytdlpCustomPath: event.target.value }
                            : previous,
                        )
                      }
                      placeholder="D:\\tools\\yt-dlp.exe"
                      className="border-white/12 bg-black/20 text-sm"
                    />
                  </label>

                  <label className="space-y-1">
                    <p className="text-xs text-zinc-400">Путь к ffmpeg (custom)</p>
                    <Input
                      value={form.ffmpegCustomPath ?? ""}
                      onChange={(event) =>
                        setForm((previous) =>
                          previous
                            ? { ...previous, ffmpegCustomPath: event.target.value }
                            : previous,
                        )
                      }
                      placeholder="D:\\tools\\ffmpeg.exe"
                      className="border-white/12 bg-black/20 text-sm"
                    />
                  </label>

                  <label className="space-y-1">
                    <p className="text-xs text-zinc-400">Путь к ffprobe (custom)</p>
                    <Input
                      value={form.ffprobeCustomPath ?? ""}
                      onChange={(event) =>
                        setForm((previous) =>
                          previous
                            ? { ...previous, ffprobeCustomPath: event.target.value }
                            : previous,
                        )
                      }
                      placeholder="D:\\tools\\ffprobe.exe"
                      className="border-white/12 bg-black/20 text-sm"
                    />
                  </label>
                </div>
              ) : null}

              {errorText ? (
                <div className="rounded-lg border border-rose-300/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
                  {errorText}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  className="bg-zinc-100 text-zinc-950 hover:bg-zinc-100/90"
                  disabled={!changed || saving}
                  onClick={() => {
                    if (!form) {
                      return
                    }
                    setSaving(true)
                    setErrorText(null)
                    void saveRuntimeToolsSettings(form)
                      .then(async () => {
                        onRuntimeMessage?.("Настройки runtime сохранены.")
                        await loadStatus(true)
                      })
                      .catch((error) => {
                        setErrorText(error instanceof Error ? error.message : "Не удалось сохранить настройки.")
                      })
                      .finally(() => setSaving(false))
                  }}
                >
                  <SaveIcon className="size-4" />
                  {saving ? "Сохранение..." : "Сохранить настройки"}
                </Button>
                <div className="flex items-center gap-1 text-xs text-zinc-500">
                  <ShieldCheckIcon className="size-3.5" />
                  Инструменты исполняются только в Rust backend.
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
