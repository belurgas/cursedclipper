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
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import i18n from "@/shared/i18n/i18n"
import {
  getStoredUiLanguage,
  hasStoredUiLanguage,
  normalizeUiLanguage,
  setStoredUiLanguage,
  type UiLanguage,
} from "@/shared/i18n/language"
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
}> = [{ id: "managed" }, { id: "custom" }, { id: "system" }]

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

const isMacLikePlatform =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent)

const normalizeSettings = (settings: RuntimeToolsSettings): RuntimeToolsSettings => ({
  ...settings,
  uiLanguage: normalizeUiLanguage(settings.uiLanguage),
})

export function SettingsView({
  onRuntimeMessage,
  initialStatus = null,
  onStatusChange,
}: SettingsViewProps) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<RuntimeToolsStatus | null>(initialStatus)
  const [form, setForm] = useState<RuntimeToolsSettings | null>(
    initialStatus?.settings ? normalizeSettings(initialStatus.settings) : null,
  )
  const [loading, setLoading] = useState(!initialStatus)
  const [saving, setSaving] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [installingFfmpeg, setInstallingFfmpeg] = useState(false)
  const [pickingDir, setPickingDir] = useState(false)
  const [openingDir, setOpeningDir] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [errorText, setErrorText] = useState<string | null>(null)
  const [isLanguageSwitching, setIsLanguageSwitching] = useState(false)

  const applyStatus = (payload: RuntimeToolsStatus) => {
    const normalizedSettings = normalizeSettings(payload.settings)
    const hasStoredLanguage = hasStoredUiLanguage()
    const effectiveLanguage = hasStoredLanguage
      ? getStoredUiLanguage()
      : normalizedSettings.uiLanguage
    const settingsWithEffectiveLanguage: RuntimeToolsSettings = {
      ...normalizedSettings,
      uiLanguage: effectiveLanguage,
    }
    const normalizedPayload: RuntimeToolsStatus = {
      ...payload,
      settings: settingsWithEffectiveLanguage,
    }
    setStatus(normalizedPayload)
    setForm(settingsWithEffectiveLanguage)
    if (!hasStoredLanguage) {
      setStoredUiLanguage(effectiveLanguage)
      if (normalizeUiLanguage(i18n.language) !== effectiveLanguage) {
        void i18n.changeLanguage(effectiveLanguage)
      }
    }
    onStatusChange?.(normalizedPayload)
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
      setErrorText(error instanceof Error ? error.message : t("settings.messages.loadFailed"))
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
            {t("settings.runtimeTitle")}
          </CardTitle>
          <p className="text-sm text-zinc-400">{t("settings.runtimeDescription")}</p>
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
                  {tool?.available ? tool?.version ?? "OK" : tool?.message ?? "Missing"}
                </p>
                <p className="mt-1 text-[11px] opacity-70">Source: {tool?.source ?? "unknown"}</p>
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
              {t("settings.refreshStatuses")}
            </Button>
            <Button
              className="bg-zinc-100 text-zinc-950 hover:bg-zinc-100/90"
              onClick={() => {
                setInstalling(true)
                setErrorText(null)
                void installOrUpdateManagedYtdlp()
                  .then(async () => {
                    onRuntimeMessage?.(t("settings.messages.ytdlpInstalled"))
                    await loadStatus(true)
                  })
                  .catch((error) => {
                    setErrorText(
                      error instanceof Error
                        ? error.message
                        : t("settings.messages.installYtdlpFailed"),
                    )
                  })
                  .finally(() => setInstalling(false))
              }}
              disabled={installing}
            >
              <DownloadIcon className="size-4" />
              {installing ? t("settings.installing") : t("settings.installYtdlp")}
            </Button>
            <Button
              className="bg-zinc-100/12 text-zinc-100 hover:bg-zinc-100/18"
              onClick={() => {
                setInstallingFfmpeg(true)
                setErrorText(null)
                void installOrUpdateManagedFfmpeg()
                  .then(async () => {
                    onRuntimeMessage?.(t("settings.messages.ffmpegInstalled"))
                    await loadStatus(true)
                  })
                  .catch((error) => {
                    setErrorText(
                      error instanceof Error
                        ? error.message
                        : t("settings.messages.installFfmpegFailed"),
                    )
                  })
                  .finally(() => setInstallingFfmpeg(false))
              }}
              disabled={installingFfmpeg}
            >
              <WrenchIcon className="size-4" />
              {installingFfmpeg ? t("settings.installingFfmpeg") : t("settings.installFfmpeg")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-panel border-white/12 bg-white/3 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-zinc-100">
            <CpuIcon className="size-4 text-zinc-300" />
            {t("settings.configurationTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!form || !status ? (
            <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-zinc-400">
              {loading ? t("settings.loading") : t("settings.unavailable")}
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <p className="text-xs tracking-[0.18em] text-zinc-500 uppercase">
                  {t("settings.languageTitle")}
                </p>
                <p className="text-xs text-zinc-400">{t("settings.languageDescription")}</p>
                <div className="grid gap-2 md:grid-cols-2">
                  {([
                    { id: "en", label: t("settings.languageEn") },
                    { id: "ru", label: t("settings.languageRu") },
                  ] as const).map((option) => {
                    const active = form.uiLanguage === option.id
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
                        disabled={isLanguageSwitching}
                        onClick={() => {
                          const nextLanguage = normalizeUiLanguage(option.id) as UiLanguage
                          if (
                            nextLanguage === normalizeUiLanguage(i18n.language) ||
                            isLanguageSwitching
                          ) {
                            setForm((previous) =>
                              previous ? { ...previous, uiLanguage: nextLanguage } : previous,
                            )
                            return
                          }
                          setIsLanguageSwitching(true)
                          setStoredUiLanguage(nextLanguage)
                          setForm((previous) =>
                            previous ? { ...previous, uiLanguage: nextLanguage } : previous,
                          )
                          void i18n
                            .changeLanguage(nextLanguage)
                            .catch(() => {})
                            .finally(() => {
                              setIsLanguageSwitching(false)
                            })
                        }}
                      >
                        <p className="text-sm font-medium">{option.label}</p>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs tracking-[0.18em] text-zinc-500 uppercase">{t("settings.ytdlpMode")}</p>
                <div className="grid gap-2 md:grid-cols-3">
                  {visibleModeOptions.map((option) => {
                    const active = form.ytdlpMode === option.id
                    const optionLabel =
                      option.id === "managed"
                        ? t("settings.mode.managedLabel")
                        : option.id === "custom"
                          ? t("settings.mode.customLabel")
                          : t("settings.mode.systemLabel")
                    const optionHint =
                      option.id === "managed"
                        ? t("settings.mode.managedHint")
                        : option.id === "custom"
                          ? t("settings.mode.customHint")
                          : t("settings.mode.systemHint")
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
                        <p className="text-sm font-medium">{optionLabel}</p>
                        <p className="mt-1 text-xs opacity-80">{optionHint}</p>
                      </button>
                    )
                  })}
                </div>
                {!status.ytdlpSystemAvailable ? (
                  <p className="text-[11px] text-zinc-500">{t("settings.systemModeHidden")}</p>
                ) : null}
              </div>

              <div className="rounded-xl border border-white/10 bg-black/24 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs tracking-[0.14em] text-zinc-500 uppercase">
                      {t("settings.projectsFolder")}
                    </p>
                    <p className="mt-1 text-xs text-zinc-400 break-all">
                      {t("settings.activeFolder", { path: status.projectsDir })}
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
                            setErrorText(
                              error instanceof Error
                                ? error.message
                                : t("settings.messages.pickFolderFailed"),
                            )
                          })
                          .finally(() => setPickingDir(false))
                      }}
                    >
                      {t("settings.selectFolder")}
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
                            onRuntimeMessage?.(t("settings.messages.openedFolder", { path }))
                          })
                          .catch((error) => {
                            setErrorText(
                              error instanceof Error
                                ? error.message
                                : t("settings.messages.openFolderFailed"),
                            )
                          })
                          .finally(() => setOpeningDir(false))
                      }}
                    >
                      <FolderOpenIcon className="size-3.5" />
                      {t("settings.openFolder")}
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
                      {t("settings.defaultFolder")}
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
                  placeholder={t("settings.folderPlaceholder")}
                  className="mt-2 border-white/12 bg-black/20 text-sm"
                />
                <p className="mt-1 text-[11px] text-zinc-500">{t("settings.folderHint")}</p>
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
                  {t("settings.autoUpdate")}
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
                  {t("settings.preferBundled")}
                </button>
              </div>

              <button
                type="button"
                className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-black/22 px-3 py-2 text-left text-xs text-zinc-300 transition hover:bg-white/6"
                onClick={() => setShowAdvanced((value) => !value)}
              >
                <span>{t("settings.advancedPaths")}</span>
                {showAdvanced ? <ChevronUpIcon className="size-4" /> : <ChevronDownIcon className="size-4" />}
              </button>

              {showAdvanced ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="space-y-1">
                    <p className="text-xs text-zinc-400">{t("settings.customYtdlp")}</p>
                    <Input
                      value={form.ytdlpCustomPath ?? ""}
                      onChange={(event) =>
                        setForm((previous) =>
                          previous
                            ? { ...previous, ytdlpCustomPath: event.target.value }
                            : previous,
                        )
                      }
                      placeholder={isMacLikePlatform ? "/usr/local/bin/yt-dlp" : "D:\\tools\\yt-dlp.exe"}
                      className="border-white/12 bg-black/20 text-sm"
                    />
                  </label>

                  <label className="space-y-1">
                    <p className="text-xs text-zinc-400">{t("settings.customFfmpeg")}</p>
                    <Input
                      value={form.ffmpegCustomPath ?? ""}
                      onChange={(event) =>
                        setForm((previous) =>
                          previous
                            ? { ...previous, ffmpegCustomPath: event.target.value }
                            : previous,
                        )
                      }
                      placeholder={isMacLikePlatform ? "/usr/local/bin/ffmpeg" : "D:\\tools\\ffmpeg.exe"}
                      className="border-white/12 bg-black/20 text-sm"
                    />
                  </label>

                  <label className="space-y-1">
                    <p className="text-xs text-zinc-400">{t("settings.customFfprobe")}</p>
                    <Input
                      value={form.ffprobeCustomPath ?? ""}
                      onChange={(event) =>
                        setForm((previous) =>
                          previous
                            ? { ...previous, ffprobeCustomPath: event.target.value }
                            : previous,
                        )
                      }
                      placeholder={isMacLikePlatform ? "/usr/local/bin/ffprobe" : "D:\\tools\\ffprobe.exe"}
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
                      .then(async (saved) => {
                        const language = normalizeUiLanguage(saved.uiLanguage)
                        setStoredUiLanguage(language)
                        if (normalizeUiLanguage(i18n.language) !== language) {
                          await i18n.changeLanguage(language)
                        }
                        onRuntimeMessage?.(t("settings.messages.saved"))
                        await loadStatus(true)
                      })
                      .catch((error) => {
                        setErrorText(
                          error instanceof Error
                            ? error.message
                            : t("settings.messages.saveFailed"),
                        )
                      })
                      .finally(() => setSaving(false))
                  }}
                >
                  <SaveIcon className="size-4" />
                  {saving ? t("settings.saving") : t("settings.save")}
                </Button>
                <div className="flex items-center gap-1 text-xs text-zinc-500">
                  <ShieldCheckIcon className="size-3.5" />
                  {t("settings.securityHint")}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
