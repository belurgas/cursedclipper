import { useState } from "react"
import type { ClipCanvasDraft, ExportClipDraft, SubtitleRenderProfile } from "@/app/types"
import { DownloadIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"
import {
  clipCanvasResolutionPresetsByAspect,
  defaultResolutionByAspect,
  normalizeClipCanvasResolution,
} from "@/features/workspace/canvas-presets"
import {
  buildSubtitleFontOptions,
  canonicalizeSubtitleFontLabel,
  resolveSubtitleFontCssFamily,
} from "@/features/workspace/subtitle-fonts"
import type { WorkspaceController } from "@/features/workspace/workspace-controller-types"

type ClipsContextPanelProps = {
  controller: WorkspaceController
  onOpenExportMode: () => void
}

type ContextTab = "video" | "subtitles"

export default function ClipsContextPanel({
  controller,
  onOpenExportMode,
}: ClipsContextPanelProps) {
  const { t } = useTranslation()
  const { clips, ai, activeClipId, exports, actions, media, transcript } = controller
  const [activeTab, setActiveTab] = useState<ContextTab>("video")
  const subtitlesAvailable = transcript.words.length > 0
  const totalClipDuration = clips.reduce((sum, clip) => sum + (clip.end - clip.start), 0)
  const activeClip = clips.find((clip) => clip.id === activeClipId) ?? clips[0] ?? null
  const activeSubtitleProfile = ai.activeSubtitlePreset?.renderProfile ?? null
  const inferFallbackAspect = (): ClipCanvasDraft["aspect"] => {
    if (media.videoWidth > 0 && media.videoHeight > 0) {
      if (Math.abs(media.videoWidth - media.videoHeight) <= 2) {
        return "1:1"
      }
      return media.videoWidth > media.videoHeight ? "16:9" : "9:16"
    }
    const preferredPlatform =
      ai.platformPresets.find((preset) => ai.selectedPlatformPresetIds.includes(preset.id)) ??
      ai.platformPresets[0]
    if (preferredPlatform?.aspect === "9:16" || preferredPlatform?.aspect === "1:1") {
      return preferredPlatform.aspect
    }
    return "16:9"
  }

  const normalizeCanvas = (
    canvas: Partial<ClipCanvasDraft> | null | undefined,
    fallbackAspect: ClipCanvasDraft["aspect"],
  ): ClipCanvasDraft => {
    const aspect =
      canvas?.aspect === "9:16" || canvas?.aspect === "16:9" || canvas?.aspect === "1:1"
        ? canvas.aspect
        : fallbackAspect
    return {
      aspect,
      resolution: normalizeClipCanvasResolution(aspect, canvas?.resolution),
      fitMode: canvas?.fitMode === "contain" ? "contain" : "cover",
      zoom:
        typeof canvas?.zoom === "number" && Number.isFinite(canvas.zoom)
          ? Math.min(3, Math.max(0.35, canvas.zoom))
          : 1,
      offsetX:
        typeof canvas?.offsetX === "number" && Number.isFinite(canvas.offsetX)
          ? Math.min(1, Math.max(-1, canvas.offsetX))
          : 0,
      offsetY:
        typeof canvas?.offsetY === "number" && Number.isFinite(canvas.offsetY)
          ? Math.min(1, Math.max(-1, canvas.offsetY))
          : 0,
      subtitlePosition:
        canvas?.subtitlePosition === "top" || canvas?.subtitlePosition === "center"
          ? canvas.subtitlePosition
          : "bottom",
      subtitleOffsetX:
        typeof canvas?.subtitleOffsetX === "number" && Number.isFinite(canvas.subtitleOffsetX)
          ? Math.min(1, Math.max(-1, canvas.subtitleOffsetX))
          : 0,
      subtitleOffsetY:
        typeof canvas?.subtitleOffsetY === "number" && Number.isFinite(canvas.subtitleOffsetY)
          ? Math.min(1, Math.max(-1, canvas.subtitleOffsetY))
          : 0,
      subtitleBoxWidth:
        typeof canvas?.subtitleBoxWidth === "number" && Number.isFinite(canvas.subtitleBoxWidth)
          ? Math.min(1.65, Math.max(0.55, canvas.subtitleBoxWidth))
          : 1,
      subtitleBoxHeight:
        typeof canvas?.subtitleBoxHeight === "number" && Number.isFinite(canvas.subtitleBoxHeight)
          ? Math.min(1.65, Math.max(0.55, canvas.subtitleBoxHeight))
          : 1,
    }
  }

  const ensureDraft = (clipId: string): ExportClipDraft => {
    const existing = exports.clipDrafts[clipId]
    const fallbackAspect = inferFallbackAspect()
    if (existing?.canvas) {
      return {
        ...existing,
        subtitleEnabled:
          subtitlesAvailable &&
          (typeof existing.subtitleEnabled === "boolean" ? existing.subtitleEnabled : false),
        canvas: normalizeCanvas(existing.canvas, fallbackAspect),
      }
    }
    const fallbackPlatforms =
      ai.selectedPlatformPresetIds.length > 0
        ? ai.selectedPlatformPresetIds
        : ai.platformPresets.slice(0, 1).map((preset) => preset.id)
    return {
      title: activeClip?.title ?? t("clipsContextPanel.clipDefaultTitle"),
      description: "",
      tags: "",
      subtitleEnabled:
        subtitlesAvailable &&
        (typeof existing?.subtitleEnabled === "boolean" ? existing.subtitleEnabled : false),
      platformIds: existing?.platformIds?.length ? existing.platformIds : fallbackPlatforms,
      platformCovers: existing?.platformCovers ?? {},
      canvas: normalizeCanvas(existing?.canvas, fallbackAspect),
    }
  }

  const activeCanvas = activeClip ? ensureDraft(activeClip.id).canvas : null
  const activeDraft = activeClip ? ensureDraft(activeClip.id) : null
  const subtitleFontItems = buildSubtitleFontOptions(activeSubtitleProfile?.fontFamily)
  const selectedSubtitleFont =
    canonicalizeSubtitleFontLabel(activeSubtitleProfile?.fontFamily) ?? "Manrope"
  const updateCanvas = (
    patch: Partial<ClipCanvasDraft>,
    options?: {
      recordHistory?: boolean
    },
  ) => {
    if (!activeClip) {
      return
    }
    const current = ensureDraft(activeClip.id)
    actions.setExportClipDrafts(
      {
        ...exports.clipDrafts,
        [activeClip.id]: {
          ...current,
          canvas: {
            ...current.canvas,
            ...patch,
          },
        },
      },
      { recordHistory: options?.recordHistory ?? true },
    )
  }

  const updateSubtitleProfile = (patch: Partial<SubtitleRenderProfile>) => {
    if (!activeSubtitleProfile) {
      return
    }
    actions.updateActiveSubtitleRenderProfile(patch)
  }

  const setClipSubtitleEnabled = (enabled: boolean) => {
    if (!activeClip) {
      return
    }
    const nextEnabled = subtitlesAvailable ? enabled : false
    const current = ensureDraft(activeClip.id)
    actions.setExportClipDrafts({
      ...exports.clipDrafts,
      [activeClip.id]: {
        ...current,
        subtitleEnabled: nextEnabled,
      },
    })
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-white/10 bg-black/26 p-3">
        <p className="text-xs tracking-[0.15em] text-zinc-500 uppercase">{t("clipsContextPanel.title")}</p>
        <p className="mt-2 text-sm text-zinc-200">{t("clipsContextPanel.clipsCount", { count: clips.length })}</p>
        <p className="text-xs text-zinc-500">{t("clipsContextPanel.totalDuration", { seconds: Math.round(totalClipDuration) })}</p>
        <p className="mt-1 text-[11px] text-zinc-500">
          {activeClip ? t("clipsContextPanel.activeClip", { title: activeClip.title }) : t("clipsContextPanel.noActiveClip")}
        </p>
        <Button
          className="mt-3 w-full bg-zinc-100 text-zinc-950 hover:bg-zinc-100/90"
          disabled={clips.length === 0}
          onClick={onOpenExportMode}
        >
          <DownloadIcon className="size-4" />
          {t("clipsContextPanel.openExport")}
        </Button>
      </div>

      <div className="rounded-xl border border-white/10 bg-black/24 p-3">
        <p className="text-xs tracking-[0.15em] text-zinc-500 uppercase">{t("clipsContextPanel.parametersTitle")}</p>
        <p className="mt-1 text-xs text-zinc-500">{t("clipsContextPanel.parametersDescription")}</p>

        <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg border border-white/10 bg-black/24 p-1">
          {([
            { id: "video", label: t("clipsContextPanel.tabVideo") },
            { id: "subtitles", label: t("clipsContextPanel.tabSubtitles") },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={[
                "rounded-md px-2 py-1.5 text-xs transition",
                activeTab === tab.id
                  ? "bg-zinc-100/16 text-zinc-100"
                  : "text-zinc-400 hover:bg-white/8 hover:text-zinc-200",
              ].join(" ")}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "video" ? (
          <div className="mt-2 space-y-2">
            <div>
              <p className="text-[11px] text-zinc-500">{t("clipsContextPanel.videoFormat")}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {(["9:16", "16:9", "1:1"] as const).map((aspect) => (
                  <button
                    key={aspect}
                    onClick={() =>
                      updateCanvas({ aspect, resolution: defaultResolutionByAspect[aspect] })
                    }
                    className={[
                      "rounded-md border px-2 py-1 text-xs transition",
                      activeCanvas?.aspect === aspect
                        ? "border-zinc-200/40 bg-zinc-100/12 text-zinc-100"
                        : "border-white/10 bg-white/6 text-zinc-300 hover:border-white/20",
                    ].join(" ")}
                  >
                    {aspect}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[11px] text-zinc-500">{t("clipsContextPanel.resolution")}</p>
              <div className="mt-1.5 grid gap-1.5">
                {clipCanvasResolutionPresetsByAspect[activeCanvas?.aspect ?? "16:9"].map((resolution) => (
                  <button
                    key={resolution.id}
                    onClick={() => updateCanvas({ resolution: resolution.id })}
                    className={[
                      "rounded-md border px-2 py-1 text-left text-xs transition",
                      activeCanvas?.resolution === resolution.id
                        ? "border-zinc-200/40 bg-zinc-100/12 text-zinc-100"
                        : "border-white/10 bg-white/6 text-zinc-300 hover:border-white/20",
                    ].join(" ")}
                  >
                    {resolution.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[11px] text-zinc-500">{t("clipsContextPanel.framing")}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {([
                  { id: "cover", label: t("clipsContextPanel.fitCover") },
                  { id: "contain", label: t("clipsContextPanel.fitContain") },
                ] as const).map((fit) => (
                  <button
                    key={fit.id}
                    onClick={() => updateCanvas({ fitMode: fit.id })}
                    className={[
                      "rounded-md border px-2 py-1 text-xs transition",
                      activeCanvas?.fitMode === fit.id
                        ? "border-zinc-200/40 bg-zinc-100/12 text-zinc-100"
                        : "border-white/10 bg-white/6 text-zinc-300 hover:border-white/20",
                    ].join(" ")}
                  >
                    {fit.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-zinc-500">{t("clipsContextPanel.zoom")}</p>
                <span className="text-[11px] text-zinc-400">{(activeCanvas?.zoom ?? 1).toFixed(2)}x</span>
              </div>
              <input
                type="range"
                min={0.35}
                max={3}
                step={0.01}
                value={activeCanvas?.zoom ?? 1}
                onChange={(event) =>
                  updateCanvas(
                    { zoom: Number(event.currentTarget.value) },
                    { recordHistory: false },
                  )
                }
                onPointerUp={(event) =>
                  updateCanvas({ zoom: Number(event.currentTarget.value) }, { recordHistory: true })
                }
                onPointerCancel={(event) =>
                  updateCanvas({ zoom: Number(event.currentTarget.value) }, { recordHistory: true })
                }
                className="mt-1 h-2 w-full cursor-pointer appearance-none rounded-full bg-white/12 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-zinc-100 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-zinc-100"
              />
            </div>

            <Button
              size="xs"
              variant="outline"
              className="border-white/15 bg-transparent text-zinc-200 hover:bg-white/8"
              onClick={() =>
                updateCanvas({
                  zoom: 1,
                  offsetX: 0,
                  offsetY: 0,
                })
              }
            >
              {t("clipsContextPanel.resetFrame")}
            </Button>
          </div>
        ) : (
          <div className="mt-2 space-y-2">
            <div className="rounded-md border border-white/10 bg-black/24 p-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] text-zinc-300">{t("clipsContextPanel.subtitlesPerClipTitle")}</p>
                  <p className="text-[10px] text-zinc-500">{t("clipsContextPanel.subtitlesPerClipDescription")}</p>
                </div>
                <button
                  type="button"
                  disabled={!activeClip || !subtitlesAvailable}
                  onClick={() => setClipSubtitleEnabled(!(activeDraft?.subtitleEnabled ?? false))}
                  className={[
                    "rounded-md border px-2 py-1 text-[11px] transition",
                    activeDraft?.subtitleEnabled
                      ? "border-emerald-200/50 bg-emerald-300/22 text-emerald-100"
                      : "border-white/10 bg-white/6 text-zinc-300 hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-50",
                  ].join(" ")}
                >
                  {activeDraft?.subtitleEnabled ? t("clipsContextPanel.enabled") : t("clipsContextPanel.disabled")}
                </button>
              </div>
            </div>

            {!subtitlesAvailable ? (
              <div className="rounded-md border border-white/10 bg-black/24 px-2.5 py-2">
                <p className="text-[11px] text-zinc-300">
                  {t("clipsContextPanel.subtitlesUnavailableTitle")}
                </p>
                <p className="mt-1 text-[10px] text-zinc-500">
                  {t("clipsContextPanel.subtitlesUnavailableDescription")}
                </p>
              </div>
            ) : (
              <>
                <div>
                  <p className="text-[11px] text-zinc-500">{t("clipsContextPanel.subtitleStyle")}</p>
                  <div className="mt-1.5 grid gap-1.5">
                    {ai.subtitlePresets.map((preset) => {
                      const selected = preset.id === ai.activeSubtitlePresetId
                      return (
                        <button
                          key={preset.id}
                          onClick={() => actions.setActiveSubtitlePresetId(preset.id)}
                          className={[
                            "rounded-md border px-2 py-1.5 text-left text-xs transition",
                            selected
                              ? "border-zinc-200/40 bg-zinc-100/12 text-zinc-100"
                              : "border-white/10 bg-white/6 text-zinc-300 hover:border-white/20",
                          ].join(" ")}
                        >
                          {t(`subtitlePresetCatalog.${preset.id}.name`, { defaultValue: preset.name })}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div>
                  <p className="text-[11px] text-zinc-500">{t("clipsContextPanel.font")}</p>
                  <div className="mt-1.5 space-y-1.5">
                    <Combobox
                      items={subtitleFontItems}
                      value={selectedSubtitleFont}
                      onValueChange={(value) => {
                        if (typeof value !== "string" || !value.trim()) {
                          return
                        }
                        updateSubtitleProfile({
                          fontFamily: canonicalizeSubtitleFontLabel(value) ?? "Manrope",
                        })
                      }}
                    >
                      <ComboboxInput
                        className="w-full"
                        placeholder={t("clipsContextPanel.fontSearchPlaceholder")}
                        aria-label={t("clipsContextPanel.fontSearchAria")}
                      />
                      <ComboboxContent>
                        <ComboboxEmpty>{t("clipsContextPanel.fontNotFound")}</ComboboxEmpty>
                        <ComboboxList>
                          {(font) => (
                            <ComboboxItem key={font} value={font}>
                              <span
                                className="truncate"
                                style={{ fontFamily: resolveSubtitleFontCssFamily(font) }}
                              >
                                {font}
                              </span>
                            </ComboboxItem>
                          )}
                        </ComboboxList>
                      </ComboboxContent>
                    </Combobox>
                    <div className="rounded-md border border-white/10 bg-black/20 px-2 py-1.5">
                      <p
                        className="truncate text-[11px] text-zinc-300"
                        style={{ fontFamily: resolveSubtitleFontCssFamily(selectedSubtitleFont) }}
                      >
                        {selectedSubtitleFont} · Aa Bb 123
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] text-zinc-500">{t("clipsContextPanel.fontSize")}</p>
                    <span className="text-[11px] text-zinc-400">{activeSubtitleProfile?.fontSize ?? 52}px</span>
                  </div>
                  <input
                    type="range"
                    min={24}
                    max={104}
                    step={1}
                    value={activeSubtitleProfile?.fontSize ?? 52}
                    onChange={(event) =>
                      updateSubtitleProfile({ fontSize: Number(event.currentTarget.value) })
                    }
                    className="mt-1 h-2 w-full cursor-pointer appearance-none rounded-full bg-white/12 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-zinc-100 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-zinc-100"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] text-zinc-500">{t("clipsContextPanel.lineHeight")}</p>
                    <span className="text-[11px] text-zinc-400">
                      {(activeSubtitleProfile?.lineHeight ?? 1.12).toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.9}
                    max={1.8}
                    step={0.01}
                    value={activeSubtitleProfile?.lineHeight ?? 1.12}
                    onChange={(event) =>
                      updateSubtitleProfile({ lineHeight: Number(event.currentTarget.value) })
                    }
                    className="mt-1 h-2 w-full cursor-pointer appearance-none rounded-full bg-white/12 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-zinc-100 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-zinc-100"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] text-zinc-500">{t("clipsContextPanel.wordsPerLine")}</p>
                      <span className="text-[11px] text-zinc-400">{activeSubtitleProfile?.maxWordsPerLine ?? 5}</span>
                    </div>
                    <input
                      type="range"
                      min={2}
                      max={14}
                      step={1}
                      value={activeSubtitleProfile?.maxWordsPerLine ?? 5}
                      onChange={(event) =>
                        updateSubtitleProfile({ maxWordsPerLine: Number(event.currentTarget.value) })
                      }
                      className="mt-1 h-2 w-full cursor-pointer appearance-none rounded-full bg-white/12 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-zinc-100 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-zinc-100"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] text-zinc-500">{t("clipsContextPanel.linesPerBlock")}</p>
                      <span className="text-[11px] text-zinc-400">{activeSubtitleProfile?.maxLines ?? 2}</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={6}
                      step={1}
                      value={activeSubtitleProfile?.maxLines ?? 2}
                      onChange={(event) =>
                        updateSubtitleProfile({ maxLines: Number(event.currentTarget.value) })
                      }
                      className="mt-1 h-2 w-full cursor-pointer appearance-none rounded-full bg-white/12 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-zinc-100 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-zinc-100"
                    />
                  </div>
                </div>

                <div>
                  <p className="text-[11px] text-zinc-500">{t("clipsContextPanel.textBoxBounds")}</p>
                  <div className="mt-1.5 grid gap-2">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] text-zinc-500">{t("clipsContextPanel.width")}</p>
                        <span className="text-[11px] text-zinc-400">
                          {(activeCanvas?.subtitleBoxWidth ?? 1).toFixed(2)}x
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.55}
                        max={1.65}
                        step={0.01}
                        value={activeCanvas?.subtitleBoxWidth ?? 1}
                        onChange={(event) =>
                          updateCanvas(
                            { subtitleBoxWidth: Number(event.currentTarget.value) },
                            { recordHistory: false },
                          )
                        }
                        onPointerUp={(event) =>
                          updateCanvas(
                            { subtitleBoxWidth: Number(event.currentTarget.value) },
                            { recordHistory: true },
                          )
                        }
                        className="mt-1 h-2 w-full cursor-pointer appearance-none rounded-full bg-white/12 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-zinc-100 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-zinc-100"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] text-zinc-500">{t("clipsContextPanel.height")}</p>
                        <span className="text-[11px] text-zinc-400">
                          {(activeCanvas?.subtitleBoxHeight ?? 1).toFixed(2)}x
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.55}
                        max={1.65}
                        step={0.01}
                        value={activeCanvas?.subtitleBoxHeight ?? 1}
                        onChange={(event) =>
                          updateCanvas(
                            { subtitleBoxHeight: Number(event.currentTarget.value) },
                            { recordHistory: false },
                          )
                        }
                        onPointerUp={(event) =>
                          updateCanvas(
                            { subtitleBoxHeight: Number(event.currentTarget.value) },
                            { recordHistory: true },
                          )
                        }
                        className="mt-1 h-2 w-full cursor-pointer appearance-none rounded-full bg-white/12 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-zinc-100 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-zinc-100"
                      />
                    </div>
                  </div>
                </div>

                <p className="text-[11px] text-zinc-500">
                  {t("clipsContextPanel.subtitleHint")}
                </p>

                <Button
                  size="xs"
                  variant="outline"
                  className="border-white/15 bg-transparent text-zinc-200 hover:bg-white/8"
                  onClick={() =>
                    updateCanvas({
                      subtitleOffsetX: 0,
                      subtitleOffsetY: 0,
                      subtitleBoxWidth: 1,
                      subtitleBoxHeight: 1,
                    })
                  }
                >
                  {t("clipsContextPanel.resetSubtitles")}
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
