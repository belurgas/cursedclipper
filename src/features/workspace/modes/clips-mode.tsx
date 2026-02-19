import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react"
import {
  FastForwardIcon,
  PauseIcon,
  PlayIcon,
  Redo2Icon,
  RewindIcon,
  ScissorsLineDashedIcon,
  Trash2Icon,
  Undo2Icon,
  UploadIcon,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { formatSeconds } from "@/app/mock-data"
import type { ClipAssemblyItem, ClipCanvasDraft, ExportClipDraft } from "@/app/types"
import { Button } from "@/components/ui/button"
import { normalizeClipCanvasResolution } from "@/features/workspace/canvas-presets"
import { ClipSceneEditor } from "@/features/workspace/clip-scene-editor"
import { MultitrackTimeline } from "@/features/workspace/multitrack-timeline"
import { buildSubtitlePreview } from "@/features/workspace/subtitle-preview"
import type { WorkspaceController } from "@/features/workspace/workspace-controller-types"

type ClipsModeProps = {
  controller: WorkspaceController
  videoRef: RefObject<HTMLVideoElement | null>
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const formatClock = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds))
  const hh = Math.floor(safe / 3600)
  const mm = Math.floor((safe % 3600) / 60)
  const ss = safe % 60
  if (hh > 0) {
    return `${hh}:${mm.toString().padStart(2, "0")}:${ss.toString().padStart(2, "0")}`
  }
  return `${mm}:${ss.toString().padStart(2, "0")}`
}

export default function ClipsMode({ controller, videoRef }: ClipsModeProps) {
  const { t } = useTranslation()
  const { clips, media, ai, transcript, exports, timeline, assembly } = controller
  const subtitlesAvailable = transcript.words.length > 0
  const actions = controller.actions
  const clipPreviewRef = useRef<HTMLVideoElement | null>(null)
  const mediaInputRef = useRef<HTMLInputElement | null>(null)
  const [assemblyTime, setAssemblyTime] = useState(0)
  const assemblyTimeRef = useRef(0)
  const [isPlaying, setIsPlaying] = useState(false)

  const clipsById = useMemo(() => new Map(clips.map((clip) => [clip.id, clip])), [clips])
  const playableEntries = useMemo(() => {
    const entries: Array<{
      trackId: string
      trackOrder: number
      item: ClipAssemblyItem
      clip: (typeof clips)[number]
    }> = []
    assembly.tracks.forEach((track, trackOrder) => {
      if (track.type !== "video" || track.hidden) {
        return
      }
      track.items.forEach((item) => {
        if (!item.sourceClipId) {
          return
        }
        const clip = clipsById.get(item.sourceClipId)
        if (!clip) {
          return
        }
        entries.push({ trackId: track.id, trackOrder, item, clip })
      })
    })
    entries.sort(
      (l, r) =>
        l.item.timelineStart - r.item.timelineStart ||
        l.trackOrder - r.trackOrder ||
        l.item.timelineEnd - r.item.timelineEnd,
    )
    return entries
  }, [assembly.tracks, clipsById])
  const playableEntriesByItemId = useMemo(
    () => new Map(playableEntries.map((entry) => [entry.item.id, entry])),
    [playableEntries],
  )
  const activePlayable = useMemo(
    () => (assembly.activeItemId ? playableEntriesByItemId.get(assembly.activeItemId) ?? null : null),
    [assembly.activeItemId, playableEntriesByItemId],
  )
  const selectedClip = controller.activeClipId ? clipsById.get(controller.activeClipId) ?? null : null
  const activeClip = selectedClip ?? activePlayable?.clip ?? clips[0] ?? null
  const timelineDuration = useMemo(
    () =>
      Math.max(
        media.duration,
        assembly.tracks.reduce(
          (maxTrackEnd, track) =>
            Math.max(maxTrackEnd, track.items.reduce((maxItemEnd, item) => Math.max(maxItemEnd, item.timelineEnd), 0)),
          0,
        ),
      ),
    [assembly.tracks, media.duration],
  )

  const findEntryAtTime = useCallback(
    (time: number) => {
      let best: (typeof playableEntries)[number] | null = null
      for (const entry of playableEntries) {
        if (time < entry.item.timelineStart - 0.0001) {
          break
        }
        if (time >= entry.item.timelineStart - 0.0001 && time < entry.item.timelineEnd - 0.0001) {
          if (
            !best ||
            entry.trackOrder < best.trackOrder ||
            (entry.trackOrder === best.trackOrder && entry.item.timelineStart < best.item.timelineStart)
          ) {
            best = entry
          }
        }
      }
      return best
    },
    [playableEntries],
  )

  const findNextEntry = useCallback(
    (time: number) => playableEntries.find((entry) => entry.item.timelineStart >= time - 0.0001) ?? null,
    [playableEntries],
  )

  const mapAssemblyToSource = useCallback((entry: (typeof playableEntries)[number], time: number) => {
    const sourceIn = Number.isFinite(entry.item.sourceIn) ? entry.item.sourceIn : entry.clip.start
    const sourceOut = Number.isFinite(entry.item.sourceOut) ? entry.item.sourceOut : entry.clip.end
    const sourceDuration = Math.max(0.0001, sourceOut - sourceIn)
    const timelineDuration = Math.max(0.0001, entry.item.timelineEnd - entry.item.timelineStart)
    const progress = clamp((time - entry.item.timelineStart) / timelineDuration, 0, 1)
    return clamp(sourceIn + sourceDuration * progress, entry.clip.start, entry.clip.end)
  }, [])

  const mapSourceToAssembly = useCallback((entry: (typeof playableEntries)[number], sourceTime: number) => {
    const sourceIn = Number.isFinite(entry.item.sourceIn) ? entry.item.sourceIn : entry.clip.start
    const sourceOut = Number.isFinite(entry.item.sourceOut) ? entry.item.sourceOut : entry.clip.end
    const sourceDuration = Math.max(0.0001, sourceOut - sourceIn)
    const timelineDuration = Math.max(0.0001, entry.item.timelineEnd - entry.item.timelineStart)
    const progress = clamp((sourceTime - sourceIn) / sourceDuration, 0, 1)
    return clamp(entry.item.timelineStart + timelineDuration * progress, entry.item.timelineStart, entry.item.timelineEnd)
  }, [])

  const seekAssembly = useCallback(
    (rawTime: number, keepPlayback = false) => {
      const safe = clamp(rawTime, 0, Math.max(timelineDuration, 1))
      const entry = findEntryAtTime(safe) ?? findNextEntry(safe)
      const player = clipPreviewRef.current
      if (!entry) {
        if (!keepPlayback && player && !player.paused) {
          player.pause()
        }
        if (Math.abs(assemblyTimeRef.current - safe) > 0.0001) {
          setAssemblyTime(safe)
          assemblyTimeRef.current = safe
        }
        return null
      }
      const targetTime = safe < entry.item.timelineStart ? entry.item.timelineStart : safe
      const sourceTime = mapAssemblyToSource(entry, targetTime)
      if (assembly.activeTrackId !== entry.trackId) {
        actions.setActiveAssemblyTrackId(entry.trackId)
      }
      if (assembly.activeItemId !== entry.item.id) {
        actions.setActiveAssemblyItemId(entry.item.id)
      }
      if (controller.activeClipId !== entry.clip.id) {
        actions.setActiveClipId(entry.clip.id)
      }
      if (player) {
        player.currentTime = sourceTime
      }
      if (videoRef.current) {
        videoRef.current.currentTime = sourceTime
      }
      actions.setCurrentTime(sourceTime)
      if (Math.abs(assemblyTimeRef.current - targetTime) > 0.0001) {
        setAssemblyTime(targetTime)
        assemblyTimeRef.current = targetTime
      }
      return entry
    },
    [
      actions,
      assembly.activeItemId,
      assembly.activeTrackId,
      controller.activeClipId,
      findEntryAtTime,
      findNextEntry,
      mapAssemblyToSource,
      timelineDuration,
      videoRef,
    ],
  )

  const togglePlayback = useCallback(() => {
    const player = clipPreviewRef.current
    if (!player) {
      return
    }
    if (!player.paused && !player.ended) {
      player.pause()
      setIsPlaying(false)
      return
    }
    const entry = seekAssembly(assemblyTimeRef.current, true)
    if (!entry) {
      return
    }
    void player.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false))
  }, [seekAssembly])

  const focusClipFromLibrary = useCallback(
    (clip: (typeof clips)[number]) => {
      actions.setActiveClipId(clip.id)
      const entry = playableEntries.find((candidate) => candidate.clip.id === clip.id)
      if (entry) {
        seekAssembly(entry.item.timelineStart)
        return
      }
      actions.setActiveAssemblyItemId(null)
      const player = clipPreviewRef.current
      if (player) {
        if (!player.paused) {
          player.pause()
        }
        player.currentTime = clip.start
      }
      if (videoRef.current) {
        videoRef.current.currentTime = clip.start
      }
      setIsPlaying(false)
      actions.setCurrentTime(clip.start)
      if (Math.abs(assemblyTimeRef.current - clip.start) > 0.0001) {
        setAssemblyTime(clip.start)
        assemblyTimeRef.current = clip.start
      }
    },
    [actions, playableEntries, seekAssembly, videoRef],
  )

  const inferFallbackAspect = (): ClipCanvasDraft["aspect"] => {
    if (media.videoWidth > 0 && media.videoHeight > 0) {
      if (Math.abs(media.videoWidth - media.videoHeight) <= 2) {
        return "1:1"
      }
      return media.videoWidth > media.videoHeight ? "16:9" : "9:16"
    }
    const preferred = ai.platformPresets.find((preset) => ai.selectedPlatformPresetIds.includes(preset.id))
    return preferred?.aspect === "9:16" || preferred?.aspect === "1:1" ? preferred.aspect : "16:9"
  }

  const normalizeCanvas = (canvas: Partial<ClipCanvasDraft> | null | undefined, fallbackAspect: ClipCanvasDraft["aspect"]): ClipCanvasDraft => {
    const aspect = canvas?.aspect === "9:16" || canvas?.aspect === "16:9" || canvas?.aspect === "1:1" ? canvas.aspect : fallbackAspect
    return {
      aspect,
      resolution: normalizeClipCanvasResolution(aspect, canvas?.resolution),
      fitMode: canvas?.fitMode === "contain" ? "contain" : "cover",
      zoom: typeof canvas?.zoom === "number" && Number.isFinite(canvas.zoom) ? clamp(canvas.zoom, 0.35, 3) : 1,
      offsetX: typeof canvas?.offsetX === "number" && Number.isFinite(canvas.offsetX) ? clamp(canvas.offsetX, -1, 1) : 0,
      offsetY: typeof canvas?.offsetY === "number" && Number.isFinite(canvas.offsetY) ? clamp(canvas.offsetY, -1, 1) : 0,
      subtitlePosition: canvas?.subtitlePosition === "top" || canvas?.subtitlePosition === "center" ? canvas.subtitlePosition : "bottom",
      subtitleOffsetX: typeof canvas?.subtitleOffsetX === "number" && Number.isFinite(canvas.subtitleOffsetX) ? clamp(canvas.subtitleOffsetX, -1, 1) : 0,
      subtitleOffsetY: typeof canvas?.subtitleOffsetY === "number" && Number.isFinite(canvas.subtitleOffsetY) ? clamp(canvas.subtitleOffsetY, -1, 1) : 0,
      subtitleBoxWidth: typeof canvas?.subtitleBoxWidth === "number" && Number.isFinite(canvas.subtitleBoxWidth) ? clamp(canvas.subtitleBoxWidth, 0.55, 1.65) : 1,
      subtitleBoxHeight: typeof canvas?.subtitleBoxHeight === "number" && Number.isFinite(canvas.subtitleBoxHeight) ? clamp(canvas.subtitleBoxHeight, 0.55, 1.65) : 1,
    }
  }

  const ensureDraft = (clipId: string): ExportClipDraft => {
    const existing = exports.clipDrafts[clipId]
    const clip = clipsById.get(clipId)
    const fallbackAspect = inferFallbackAspect()
    const fallbackPlatforms = ai.selectedPlatformPresetIds.length ? ai.selectedPlatformPresetIds : ai.platformPresets.slice(0, 1).map((preset) => preset.id)
    return {
      title: existing?.title ?? clip?.title ?? t("workspace.clipsMode.clipDefaultTitle"),
      description: existing?.description ?? "",
      tags: existing?.tags ?? "",
      subtitleEnabled:
        subtitlesAvailable &&
        (typeof existing?.subtitleEnabled === "boolean" ? existing.subtitleEnabled : false),
      platformIds: existing?.platformIds?.length ? existing.platformIds : fallbackPlatforms,
      platformCovers: existing?.platformCovers ?? {},
      canvas: normalizeCanvas(existing?.canvas, fallbackAspect),
    }
  }

  const activeDraft = activeClip ? ensureDraft(activeClip.id) : null
  const activeCanvas = activeDraft?.canvas ?? null
  const subtitlePreview = useMemo(() => {
    if (!subtitlesAvailable) {
      return null
    }
    if (!activeDraft?.subtitleEnabled) {
      return null
    }
    if (!activePlayable) {
      return null
    }
    const profile = ai.activeSubtitlePreset?.renderProfile
    if (!profile) {
      return null
    }
    return buildSubtitlePreview(transcript.visibleWords, media.currentTime, { ...profile, position: "bottom" }, {
      boxWidth: activeCanvas?.subtitleBoxWidth,
      boxHeight: activeCanvas?.subtitleBoxHeight,
    })
  }, [activeDraft?.subtitleEnabled, activePlayable, ai.activeSubtitlePreset?.renderProfile, subtitlesAvailable, transcript.visibleWords, media.currentTime, activeCanvas?.subtitleBoxWidth, activeCanvas?.subtitleBoxHeight])

  const subtitleOverlays = useMemo(
    () =>
      subtitlesAvailable
        ? playableEntries
          .filter((entry) => Boolean(exports.clipDrafts[entry.clip.id]?.subtitleEnabled))
          .map((entry) => ({
            id: `sub_${entry.item.id}`,
            start: entry.item.timelineStart,
            end: entry.item.timelineEnd,
            label: t("workspace.clipsMode.subtitleOverlayLabel"),
          }))
        : [],
    [exports.clipDrafts, playableEntries, subtitlesAvailable, t],
  )

  useEffect(() => {
    if (assembly.activeItemId || playableEntries.length === 0) {
      return
    }
    const first = playableEntries[0]
    actions.setActiveAssemblyTrackId(first.trackId)
    actions.setActiveAssemblyItemId(first.item.id)
    assemblyTimeRef.current = first.item.timelineStart
  }, [actions, assembly.activeItemId, playableEntries])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.getAttribute("contenteditable") === "true")) {
        return
      }
      const undo = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !event.shiftKey
      const redo = (event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === "y" || (event.key.toLowerCase() === "z" && event.shiftKey))
      if (undo) { event.preventDefault(); actions.undoTimeline(); return }
      if (redo) { event.preventDefault(); actions.redoTimeline(); return }
      const itemId = assembly.activeItemId
      if (event.code === "Space" || event.key.toLowerCase() === "k") { event.preventDefault(); togglePlayback(); return }
      if (event.key.toLowerCase() === "j" && !event.altKey) { event.preventDefault(); seekAssembly(assemblyTimeRef.current - 5); return }
      if (event.key.toLowerCase() === "l" && !event.altKey) { event.preventDefault(); seekAssembly(assemblyTimeRef.current + 5); return }
      if (event.altKey && event.key === "ArrowLeft" && itemId) { event.preventDefault(); actions.nudgeAssemblyItem(itemId, -0.2); return }
      if (event.altKey && event.key === "ArrowRight" && itemId) { event.preventDefault(); actions.nudgeAssemblyItem(itemId, 0.2); return }
      if (event.code === "KeyS" && itemId) { event.preventDefault(); const rightId = actions.splitAssemblyItemAtTime(itemId, assemblyTimeRef.current); if (rightId) { actions.setActiveAssemblyItemId(rightId) }; return }
      if (event.key === "[" && itemId) { event.preventDefault(); actions.trimAssemblyItemToTime(itemId, "start", assemblyTimeRef.current); return }
      if (event.key === "]" && itemId) { event.preventDefault(); actions.trimAssemblyItemToTime(itemId, "end", assemblyTimeRef.current); return }
      if ((event.key === "Delete" || event.key === "Backspace") && itemId) { event.preventDefault(); actions.removeAssemblyItem(itemId) }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [actions, assembly.activeItemId, seekAssembly, togglePlayback])

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden">
      <input ref={mediaInputRef} type="file" accept="audio/*,video/*" className="hidden" onChange={(event) => {
        const file = event.target.files?.[0]
        if (!file) { return }
        actions.appendExternalMediaToAssemblyTrack({ sourceType: file.type.startsWith("audio/") ? "audio-file" : "video-file", label: file.name || t("workspace.clipsMode.importFallbackLabel"), sourcePath: null }, assembly.activeTrackId)
        event.currentTarget.value = ""
      }} />

      {clips.length === 0 ? (
        <div className="grid h-full min-h-[420px] place-content-center gap-2 rounded-xl border border-white/10 bg-black/24 text-zinc-500"><ScissorsLineDashedIcon className="mx-auto size-5" /><p className="text-sm">{t("workspace.clipsMode.emptyStateCreateInEditor")}</p></div>
      ) : (
        <>
          <div className="grid min-h-[260px] max-h-[48vh] shrink-0 gap-3 xl:grid-cols-[minmax(236px,290px)_minmax(0,1fr)]">
            <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-white/10 bg-black/24 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs tracking-[0.14em] text-zinc-500 uppercase">{t("workspace.clipsMode.libraryTitle")}</p>
                <Button size="xs" variant="outline" className="border-white/12 bg-transparent text-zinc-300 hover:bg-white/8" onClick={() => actions.resetAssemblyFromClips()}>{t("workspace.clipsMode.autoAssemble")}</Button>
              </div>
              <div className="mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {clips.map((clip) => (
                  <div key={clip.id} onClick={() => focusClipFromLibrary(clip)} className={["cursor-pointer rounded-lg border px-3 py-2 text-left transition", clip.id === activeClip?.id ? "border-zinc-200/40 bg-zinc-100/12" : "border-white/10 bg-white/6 hover:border-white/20"].join(" ")}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm text-zinc-100">{clip.title}</p>
                      <button type="button" title={t("workspace.clipsMode.deleteClip")} className="grid h-6 w-6 place-content-center rounded-md border border-white/12 bg-transparent text-zinc-400 transition hover:bg-white/10 hover:text-zinc-200" onClick={(event) => { event.stopPropagation(); actions.removeClip(clip.id) }}><Trash2Icon className="size-3.5" /></button>
                    </div>
                    <p className="mt-1 text-[11px] text-zinc-500">{formatSeconds(clip.start)} - {formatSeconds(clip.end)}</p>
                    <Button size="xs" variant="outline" className="mt-2 border-white/12 bg-transparent text-zinc-300 hover:bg-white/8" onClick={(event) => { event.stopPropagation(); actions.appendClipToAssemblyTrack(clip.id, assembly.activeTrackId) }}>{t("workspace.clipsMode.addToTrack")}</Button>
                  </div>
                ))}
              </div>
              <div className="mt-2 shrink-0 space-y-2">
                <Button size="xs" variant="outline" className="w-full border-white/12 bg-transparent text-zinc-300 hover:bg-white/8" onClick={() => mediaInputRef.current?.click()}><UploadIcon className="size-3.5" />{t("workspace.clipsMode.addMediaFile")}</Button>
                <Button size="xs" variant="outline" className="w-full border-white/12 bg-transparent text-zinc-300 hover:bg-white/8" disabled={!assembly.activeItemId} onClick={() => assembly.activeItemId && actions.removeAssemblyItem(assembly.activeItemId)}><Trash2Icon className="size-3.5" />{t("workspace.clipsMode.removeSelectedItem")}</Button>
              </div>
            </section>

            <section className="min-h-[280px] space-y-2 overflow-hidden pr-1">
              {media.videoUrl && activeClip ? (
                <ClipSceneEditor
                  ref={clipPreviewRef}
                  src={media.videoUrl}
                  showControls={false}
                  subtitlePreview={subtitlePreview}
                  canvas={activeCanvas}
                  onCanvasChange={(patch, options) => {
                    if (!activeClip) { return }
                    const current = ensureDraft(activeClip.id)
                    actions.setExportClipDrafts({ ...exports.clipDrafts, [activeClip.id]: { ...current, canvas: { ...current.canvas, ...patch } } }, { recordHistory: options?.recordHistory ?? true })
                  }}
                  onPlaybackStateChange={setIsPlaying}
                  onTimeUpdate={(nextSourceTime) => {
                    actions.syncCurrentTime(nextSourceTime)
                    const playbackEntry = findEntryAtTime(assemblyTimeRef.current) ?? activePlayable
                    if (!playbackEntry) { return }
                    if (activePlayable && playbackEntry.item.id !== activePlayable.item.id) {
                      seekAssembly(assemblyTimeRef.current, true)
                      return
                    }
                    const nextAssembly = mapSourceToAssembly(playbackEntry, nextSourceTime)
                    if (Math.abs(assemblyTimeRef.current - nextAssembly) > 0.0001) {
                      setAssemblyTime(nextAssembly)
                      assemblyTimeRef.current = nextAssembly
                    }
                    if (isPlaying && nextAssembly >= playbackEntry.item.timelineEnd - 0.01) {
                      const nextEntry = seekAssembly(playbackEntry.item.timelineEnd + 0.0002, true)
                      if (!nextEntry || nextEntry.item.id === playbackEntry.item.id) {
                        clipPreviewRef.current?.pause()
                        setIsPlaying(false)
                        return
                      }
                      if (clipPreviewRef.current?.paused) { void clipPreviewRef.current.play().catch(() => setIsPlaying(false)) }
                    }
                  }}
                  onDurationChange={(nextDuration) => { if (nextDuration > 0 && Math.abs(media.duration - nextDuration) > 0.2) { actions.setDuration(nextDuration) } }}
                />
              ) : (
                <div className="rounded-xl border border-white/10 bg-black/22 px-3 py-4 text-xs text-zinc-500">{t("workspace.clipsMode.previewHintSelectItem")}</div>
              )}
            </section>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/24 px-3 py-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => seekAssembly(assemblyTimeRef.current - 5, isPlaying)}
                className="grid h-8 w-8 place-content-center rounded-md border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10 hover:text-zinc-100"
              >
                <RewindIcon className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={togglePlayback}
                className="grid h-8 w-8 place-content-center rounded-md border border-white/12 bg-white/6 text-zinc-100 transition hover:bg-white/12"
              >
                {isPlaying ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4 pl-0.5" />}
              </button>
              <button
                type="button"
                onClick={() => seekAssembly(assemblyTimeRef.current + 5, isPlaying)}
                className="grid h-8 w-8 place-content-center rounded-md border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10 hover:text-zinc-100"
              >
                <FastForwardIcon className="size-3.5" />
              </button>
              <p className="ml-1 text-xs text-zinc-300">
                {formatClock(assemblyTime)} <span className="text-zinc-500">/ {formatClock(timelineDuration)}</span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <Button size="xs" variant="outline" className="border-white/12 bg-transparent text-zinc-300 hover:bg-white/8" onClick={() => actions.undoTimeline()} disabled={!timeline.canUndo}><Undo2Icon className="size-3.5" />{t("workspace.clipsMode.undo")}</Button>
              <Button size="xs" variant="outline" className="border-white/12 bg-transparent text-zinc-300 hover:bg-white/8" onClick={() => actions.redoTimeline()} disabled={!timeline.canRedo}><Redo2Icon className="size-3.5" />{t("workspace.clipsMode.redo")}</Button>
              <Button size="xs" variant="outline" className="border-white/12 bg-transparent text-zinc-300 hover:bg-white/8" disabled={!assembly.activeItemId} onClick={() => assembly.activeItemId && actions.trimAssemblyItemToTime(assembly.activeItemId, "start", assemblyTimeRef.current)}>[</Button>
              <Button size="xs" variant="outline" className="border-white/12 bg-transparent text-zinc-300 hover:bg-white/8" disabled={!assembly.activeItemId} onClick={() => {
                if (!assembly.activeItemId) { return }
                const rightId = actions.splitAssemblyItemAtTime(assembly.activeItemId, assemblyTimeRef.current)
                if (rightId) { actions.setActiveAssemblyItemId(rightId) }
              }}>S</Button>
              <Button size="xs" variant="outline" className="border-white/12 bg-transparent text-zinc-300 hover:bg-white/8" disabled={!assembly.activeItemId} onClick={() => assembly.activeItemId && actions.trimAssemblyItemToTime(assembly.activeItemId, "end", assemblyTimeRef.current)}>]</Button>
            </div>
          </div>

          <div className="min-h-[120px] flex-1 overflow-hidden">
            <MultitrackTimeline
              duration={media.duration}
              currentTime={assemblyTime}
              tracks={assembly.tracks}
              activeTrackId={assembly.activeTrackId}
              activeItemId={assembly.activeItemId}
              zoom={assembly.zoom}
              onSeek={(time) => { seekAssembly(time, isPlaying) }}
              onSetActiveTrack={(trackId) => actions.setActiveAssemblyTrackId(trackId)}
              onSetActiveItem={(itemId) => {
                actions.setActiveAssemblyItemId(itemId)
                if (!itemId) { return }
                const entry = playableEntriesByItemId.get(itemId)
                if (entry) { seekAssembly(entry.item.timelineStart, isPlaying) }
              }}
              onSetZoom={actions.setAssemblyZoom}
              onAddTrack={actions.addAssemblyTrack}
              onRemoveTrack={actions.removeAssemblyTrack}
              onRenameTrack={actions.renameAssemblyTrack}
              onToggleTrackMute={actions.toggleAssemblyTrackMuted}
              onToggleTrackLock={actions.toggleAssemblyTrackLocked}
              onToggleTrackVisibility={actions.toggleAssemblyTrackHidden}
              onItemRangeChange={actions.setAssemblyItemRange}
              onMoveItemToNewVideoTrackAbove={actions.moveAssemblyItemToNewVideoTrackAbove}
              showSubtitleOverlays={subtitleOverlays.length > 0}
              subtitleOverlays={subtitleOverlays}
            />
          </div>
        </>
      )}
    </div>
  )
}
