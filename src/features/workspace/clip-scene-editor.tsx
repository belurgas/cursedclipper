import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react"
import {
  FastForwardIcon,
  PauseIcon,
  PlayIcon,
  RewindIcon,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import type { ClipCanvasDraft } from "@/app/types"
import {
  normalizeClipCanvasResolution,
} from "@/features/workspace/canvas-presets"
import { resolveSubtitleFontCssFamily } from "@/features/workspace/subtitle-fonts"
import type { SubtitlePreview } from "@/features/workspace/subtitle-preview"
import { cn } from "@/lib/utils"

type ClipSceneEditorProps = {
  src: string
  subtitlePreview?: SubtitlePreview | null
  canvas?: ClipCanvasDraft | null
  showControls?: boolean
  onCanvasChange?: (
    patch: Partial<ClipCanvasDraft>,
    options?: {
      recordHistory?: boolean
    },
  ) => void
  onTimeUpdate?: (time: number) => void
  onDurationChange?: (duration: number) => void
  onPlaybackStateChange?: (playing: boolean) => void
  onNudgeLeft?: () => void
  onNudgeRight?: () => void
  onTrimStart?: () => void
  onTrimEnd?: () => void
  onSplit?: () => void
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const normalizeCanvas = (value?: ClipCanvasDraft | null): ClipCanvasDraft => {
  const aspect: ClipCanvasDraft["aspect"] =
    value?.aspect === "9:16" || value?.aspect === "16:9" || value?.aspect === "1:1"
      ? value.aspect
      : "16:9"
  return {
    aspect,
    resolution: normalizeClipCanvasResolution(aspect, value?.resolution),
    fitMode: value?.fitMode === "contain" ? "contain" : "cover",
    zoom:
      typeof value?.zoom === "number" && Number.isFinite(value.zoom)
        ? clamp(value.zoom, 0.35, 3)
        : 1,
    offsetX:
      typeof value?.offsetX === "number" && Number.isFinite(value.offsetX)
        ? clamp(value.offsetX, -1, 1)
        : 0,
    offsetY:
      typeof value?.offsetY === "number" && Number.isFinite(value.offsetY)
        ? clamp(value.offsetY, -1, 1)
        : 0,
    subtitlePosition:
      value?.subtitlePosition === "top" || value?.subtitlePosition === "center"
        ? value.subtitlePosition
        : "bottom",
    subtitleOffsetX:
      typeof value?.subtitleOffsetX === "number" && Number.isFinite(value.subtitleOffsetX)
        ? clamp(value.subtitleOffsetX, -1, 1)
        : 0,
    subtitleOffsetY:
      typeof value?.subtitleOffsetY === "number" && Number.isFinite(value.subtitleOffsetY)
        ? clamp(value.subtitleOffsetY, -1, 1)
        : 0,
    subtitleBoxWidth:
      typeof value?.subtitleBoxWidth === "number" && Number.isFinite(value.subtitleBoxWidth)
        ? clamp(value.subtitleBoxWidth, 0.55, 1.65)
        : 1,
    subtitleBoxHeight:
      typeof value?.subtitleBoxHeight === "number" && Number.isFinite(value.subtitleBoxHeight)
        ? clamp(value.subtitleBoxHeight, 0.55, 1.65)
        : 1,
  }
}

const aspectCss = (aspect: ClipCanvasDraft["aspect"]) => {
  if (aspect === "9:16") {
    return "9 / 16"
  }
  if (aspect === "1:1") {
    return "1 / 1"
  }
  return "16 / 9"
}

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

type SubtitleResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw"

const subtitleHandleAxis = (handle: SubtitleResizeHandle) => ({
  x: handle.includes("e") ? 1 : handle.includes("w") ? -1 : 0,
  y: handle.includes("s") ? 1 : handle.includes("n") ? -1 : 0,
})

export const ClipSceneEditor = forwardRef<HTMLVideoElement, ClipSceneEditorProps>(
  function ClipSceneEditor(
    {
      src,
      subtitlePreview = null,
      canvas = null,
      showControls = true,
      onCanvasChange,
      onTimeUpdate,
      onDurationChange,
      onPlaybackStateChange,
      onNudgeLeft,
      onNudgeRight,
      onTrimStart,
      onTrimEnd,
      onSplit,
    },
    ref,
  ) {
    const { t } = useTranslation()
    const stageRef = useRef<HTMLDivElement | null>(null)
    const videoRef = useRef<HTMLVideoElement | null>(null)
    const frameRef = useRef<{
      pointerId: number
      startX: number
      startY: number
      initialOffsetX: number
      initialOffsetY: number
    } | null>(null)
    const subtitleRef = useRef<{
      pointerId: number
      startX: number
      startY: number
      initialOffsetX: number
      initialOffsetY: number
    } | null>(null)
    const subtitleResizeRef = useRef<{
      pointerId: number
      startX: number
      startY: number
      initialBoxWidth: number
      initialBoxHeight: number
      handle: SubtitleResizeHandle
    } | null>(null)
    const wheelCommitTimeoutRef = useRef<number | null>(null)
    const draggingTimelineRef = useRef(false)
    const onTimeUpdateRef = useRef<ClipSceneEditorProps["onTimeUpdate"]>(onTimeUpdate)
    const onDurationChangeRef = useRef<ClipSceneEditorProps["onDurationChange"]>(onDurationChange)
    const onPlaybackStateChangeRef = useRef<ClipSceneEditorProps["onPlaybackStateChange"]>(
      onPlaybackStateChange,
    )

    const [duration, setDuration] = useState(0)
    const [time, setTime] = useState(0)
    const [dragTime, setDragTime] = useState<number | null>(null)
    const [draggingTimeline, setDraggingTimeline] = useState(false)
    const [playing, setPlaying] = useState(false)
    const [isDraggingFrame, setIsDraggingFrame] = useState(false)
    const [isDraggingSubtitle, setIsDraggingSubtitle] = useState(false)
    const [isResizingSubtitle, setIsResizingSubtitle] = useState(false)

    const normalizedCanvas = useMemo(() => normalizeCanvas(canvas), [canvas])
    const subtitleBaseYPercent = 86
    const subtitleTranslateY = "-100%"

    const setRefs = useCallback(
      (node: HTMLVideoElement | null) => {
        videoRef.current = node
        if (typeof ref === "function") {
          ref(node)
          return
        }
        if (ref) {
          ;(ref as { current: HTMLVideoElement | null }).current = node
        }
      },
      [ref],
    )

    useEffect(() => {
      draggingTimelineRef.current = draggingTimeline
    }, [draggingTimeline])

    useEffect(() => {
      onTimeUpdateRef.current = onTimeUpdate
    }, [onTimeUpdate])

    useEffect(() => {
      onDurationChangeRef.current = onDurationChange
    }, [onDurationChange])

    useEffect(() => {
      onPlaybackStateChangeRef.current = onPlaybackStateChange
    }, [onPlaybackStateChange])

    useEffect(() => {
      const video = videoRef.current
      if (!video) {
        return
      }
      const syncDuration = () => {
        const next = Number.isFinite(video.duration) ? video.duration : 0
        setDuration(next)
        onDurationChangeRef.current?.(next)
      }
      const syncTime = () => {
        const next = Number.isFinite(video.currentTime) ? video.currentTime : 0
        if (!draggingTimelineRef.current) {
          setTime(next)
        }
        onTimeUpdateRef.current?.(next)
      }
      const syncPlayingWithCallback = () => {
        const nextPlaying = !video.paused && !video.ended
        setPlaying(nextPlaying)
        onPlaybackStateChangeRef.current?.(nextPlaying)
      }

      video.addEventListener("loadedmetadata", syncDuration)
      video.addEventListener("durationchange", syncDuration)
      video.addEventListener("timeupdate", syncTime)
      video.addEventListener("play", syncPlayingWithCallback)
      video.addEventListener("pause", syncPlayingWithCallback)
      video.addEventListener("ended", syncPlayingWithCallback)

      syncDuration()
      syncTime()
      syncPlayingWithCallback()

      return () => {
        video.removeEventListener("loadedmetadata", syncDuration)
        video.removeEventListener("durationchange", syncDuration)
        video.removeEventListener("timeupdate", syncTime)
        video.removeEventListener("play", syncPlayingWithCallback)
        video.removeEventListener("pause", syncPlayingWithCallback)
        video.removeEventListener("ended", syncPlayingWithCallback)
      }
    }, [src])

    useEffect(() => {
      const stage = stageRef.current
      if (!stage || normalizedCanvas.fitMode !== "cover") {
        return
      }
      const wheelHandler = (event: WheelEvent) => {
        if (!event.ctrlKey) {
          return
        }
        event.preventDefault()
        if (!onCanvasChange) {
          return
        }
        const delta = event.deltaY > 0 ? -0.05 : 0.05
        const nextZoom = clamp(normalizedCanvas.zoom + delta, 0.35, 3)
        onCanvasChange(
          {
            zoom: nextZoom,
          },
          { recordHistory: false },
        )
        if (wheelCommitTimeoutRef.current) {
          window.clearTimeout(wheelCommitTimeoutRef.current)
        }
        wheelCommitTimeoutRef.current = window.setTimeout(() => {
          wheelCommitTimeoutRef.current = null
          onCanvasChange(
            {
              zoom: nextZoom,
            },
            { recordHistory: true },
          )
        }, 180)
      }
      stage.addEventListener("wheel", wheelHandler, { passive: false })
      return () => {
        stage.removeEventListener("wheel", wheelHandler)
        if (wheelCommitTimeoutRef.current) {
          window.clearTimeout(wheelCommitTimeoutRef.current)
          wheelCommitTimeoutRef.current = null
        }
      }
    }, [normalizedCanvas.fitMode, normalizedCanvas.zoom, onCanvasChange])

    useEffect(
      () => () => {
        if (wheelCommitTimeoutRef.current) {
          window.clearTimeout(wheelCommitTimeoutRef.current)
          wheelCommitTimeoutRef.current = null
        }
      },
      [],
    )

    const seekTo = (next: number) => {
      const video = videoRef.current
      if (!video) {
        return
      }
      const target = clamp(next, 0, duration || 0)
      video.currentTime = target
      setTime(target)
      onTimeUpdate?.(target)
    }

    const togglePlayPause = () => {
      const video = videoRef.current
      if (!video) {
        return
      }
      if (video.paused || video.ended) {
        void video.play()
      } else {
        video.pause()
      }
    }

    const onFramePointerDown = (event: PointerEvent<HTMLDivElement>) => {
      if (normalizedCanvas.fitMode !== "cover" || !onCanvasChange) {
        return
      }
      if (subtitleRef.current || subtitleResizeRef.current) {
        return
      }
      event.preventDefault()
      frameRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        initialOffsetX: normalizedCanvas.offsetX,
        initialOffsetY: normalizedCanvas.offsetY,
      }
      setIsDraggingFrame(true)
      event.currentTarget.setPointerCapture(event.pointerId)
    }

    const onFramePointerMove = (event: PointerEvent<HTMLDivElement>) => {
      const drag = frameRef.current
      const stage = stageRef.current
      if (!drag || !stage || !onCanvasChange || drag.pointerId !== event.pointerId) {
        return
      }
      const width = Math.max(1, stage.clientWidth)
      const height = Math.max(1, stage.clientHeight)
      const nextX = drag.initialOffsetX + ((event.clientX - drag.startX) / width) * 2
      const nextY = drag.initialOffsetY + ((event.clientY - drag.startY) / height) * 2
      onCanvasChange(
        {
          offsetX: clamp(nextX, -1, 1),
          offsetY: clamp(nextY, -1, 1),
        },
        { recordHistory: false },
      )
    }

    const onFramePointerUp = (event: PointerEvent<HTMLDivElement>) => {
      const drag = frameRef.current
      if (!drag || drag.pointerId !== event.pointerId) {
        return
      }
      const stage = stageRef.current
      const width = Math.max(1, stage?.clientWidth ?? 1)
      const height = Math.max(1, stage?.clientHeight ?? 1)
      const offsetX = clamp(drag.initialOffsetX + ((event.clientX - drag.startX) / width) * 2, -1, 1)
      const offsetY = clamp(drag.initialOffsetY + ((event.clientY - drag.startY) / height) * 2, -1, 1)
      frameRef.current = null
      setIsDraggingFrame(false)
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      onCanvasChange?.(
        {
          offsetX,
          offsetY,
        },
        { recordHistory: true },
      )
    }

    const onSubtitlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
      if (!onCanvasChange || subtitleResizeRef.current) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      subtitleRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        initialOffsetX: normalizedCanvas.subtitleOffsetX,
        initialOffsetY: normalizedCanvas.subtitleOffsetY,
      }
      setIsDraggingSubtitle(true)
      event.currentTarget.setPointerCapture(event.pointerId)
    }

    const onSubtitlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
      const drag = subtitleRef.current
      const stage = stageRef.current
      if (!drag || !stage || !onCanvasChange || drag.pointerId !== event.pointerId) {
        return
      }
      event.stopPropagation()
      const width = Math.max(1, stage.clientWidth)
      const height = Math.max(1, stage.clientHeight)
      const nextX = drag.initialOffsetX + ((event.clientX - drag.startX) / width) * 2
      const nextY = drag.initialOffsetY + ((event.clientY - drag.startY) / height) * 2
      onCanvasChange(
        {
          subtitleOffsetX: clamp(nextX, -1, 1),
          subtitleOffsetY: clamp(nextY, -1, 1),
        },
        { recordHistory: false },
      )
    }

    const onSubtitlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
      const drag = subtitleRef.current
      if (!drag || drag.pointerId !== event.pointerId) {
        return
      }
      event.stopPropagation()
      const stage = stageRef.current
      const width = Math.max(1, stage?.clientWidth ?? 1)
      const height = Math.max(1, stage?.clientHeight ?? 1)
      const subtitleOffsetX = clamp(
        drag.initialOffsetX + ((event.clientX - drag.startX) / width) * 2,
        -1,
        1,
      )
      const subtitleOffsetY = clamp(
        drag.initialOffsetY + ((event.clientY - drag.startY) / height) * 2,
        -1,
        1,
      )
      subtitleRef.current = null
      setIsDraggingSubtitle(false)
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      onCanvasChange?.(
        {
          subtitleOffsetX,
          subtitleOffsetY,
        },
        { recordHistory: true },
      )
    }

    const onSubtitleResizePointerDown =
      (handle: SubtitleResizeHandle) => (event: PointerEvent<HTMLButtonElement>) => {
        if (!onCanvasChange || subtitleRef.current) {
          return
        }
        event.preventDefault()
        event.stopPropagation()
        subtitleResizeRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          initialBoxWidth: normalizedCanvas.subtitleBoxWidth,
          initialBoxHeight: normalizedCanvas.subtitleBoxHeight,
          handle,
        }
        setIsResizingSubtitle(true)
        event.currentTarget.setPointerCapture(event.pointerId)
      }

    const onSubtitleResizePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
      const drag = subtitleResizeRef.current
      const stage = stageRef.current
      if (!drag || !stage || !onCanvasChange || drag.pointerId !== event.pointerId) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      const width = Math.max(1, stage.clientWidth)
      const height = Math.max(1, stage.clientHeight)
      const axis = subtitleHandleAxis(drag.handle)
      const deltaX = ((event.clientX - drag.startX) / width) * 1.6 * axis.x
      const deltaY = ((event.clientY - drag.startY) / height) * 1.6 * axis.y
      const nextWidth = clamp(drag.initialBoxWidth + deltaX, 0.55, 1.65)
      const nextHeight = clamp(drag.initialBoxHeight + deltaY, 0.55, 1.65)
      onCanvasChange(
        {
          subtitleBoxWidth: nextWidth,
          subtitleBoxHeight: nextHeight,
        },
        { recordHistory: false },
      )
    }

    const onSubtitleResizePointerUp = (event: PointerEvent<HTMLButtonElement>) => {
      const drag = subtitleResizeRef.current
      if (!drag || drag.pointerId !== event.pointerId) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      const stage = stageRef.current
      const width = Math.max(1, stage?.clientWidth ?? 1)
      const height = Math.max(1, stage?.clientHeight ?? 1)
      const axis = subtitleHandleAxis(drag.handle)
      const deltaX = ((event.clientX - drag.startX) / width) * 1.6 * axis.x
      const deltaY = ((event.clientY - drag.startY) / height) * 1.6 * axis.y
      const subtitleBoxWidth = clamp(drag.initialBoxWidth + deltaX, 0.55, 1.65)
      const subtitleBoxHeight = clamp(drag.initialBoxHeight + deltaY, 0.55, 1.65)
      subtitleResizeRef.current = null
      setIsResizingSubtitle(false)
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
      onCanvasChange?.(
        {
          subtitleBoxWidth,
          subtitleBoxHeight,
        },
        { recordHistory: true },
      )
    }

    const displayedTime = dragTime ?? time
    const subtitleFontSize = subtitlePreview
      ? Math.max(16, Math.round(subtitlePreview.profile.fontSize * 0.36))
      : 18
    const subtitleBoxWidthPercent = clamp(88 * normalizedCanvas.subtitleBoxWidth, 34, 96)
    const subtitleBaseHeight =
      subtitleFontSize *
      (subtitlePreview?.profile.lineHeight ?? 1.12) *
      (subtitlePreview?.profile.maxLines ?? 2)
    const subtitleBoxHeightPx = Math.max(
      subtitleBaseHeight * normalizedCanvas.subtitleBoxHeight + 20,
      subtitleFontSize * 1.8,
    )
    const subtitleAnchorXPercent = clamp(50 + normalizedCanvas.subtitleOffsetX * 38, 4, 96)
    const subtitleAnchorYPercent = clamp(
      subtitleBaseYPercent + normalizedCanvas.subtitleOffsetY * 76,
      6,
      94,
    )
    const subtitleResizeHandles: Array<{
      id: SubtitleResizeHandle
      className: string
      cursor: string
    }> = [
      { id: "nw", className: "-left-1.5 -top-1.5", cursor: "cursor-nwse-resize" },
      { id: "n", className: "left-1/2 -top-1.5 -translate-x-1/2", cursor: "cursor-ns-resize" },
      { id: "ne", className: "-right-1.5 -top-1.5", cursor: "cursor-nesw-resize" },
      { id: "e", className: "-right-1.5 top-1/2 -translate-y-1/2", cursor: "cursor-ew-resize" },
      { id: "se", className: "-bottom-1.5 -right-1.5", cursor: "cursor-nwse-resize" },
      { id: "s", className: "-bottom-1.5 left-1/2 -translate-x-1/2", cursor: "cursor-ns-resize" },
      { id: "sw", className: "-bottom-1.5 -left-1.5", cursor: "cursor-nesw-resize" },
      { id: "w", className: "-left-1.5 top-1/2 -translate-y-1/2", cursor: "cursor-ew-resize" },
    ]
    const showCenterGuides = isDraggingFrame || isDraggingSubtitle || isResizingSubtitle

    return (
      <div className="flex h-full min-h-0 flex-col gap-3">
        <section
          ref={stageRef}
          className={cn(
            "relative flex min-h-[260px] max-h-[54vh] flex-1 items-center justify-center overflow-hidden rounded-xl border border-white/12 bg-black",
            "overscroll-contain",
            normalizedCanvas.fitMode === "cover"
              ? isDraggingFrame
                ? "cursor-grabbing"
                : "cursor-grab"
              : "",
          )}
          onPointerDown={onFramePointerDown}
          onPointerMove={onFramePointerMove}
          onPointerUp={onFramePointerUp}
          onPointerCancel={onFramePointerUp}
        >
          <div
            className="relative h-full max-h-full w-full max-w-[980px] overflow-hidden rounded-lg border border-white/10 bg-black"
            style={{ aspectRatio: aspectCss(normalizedCanvas.aspect), width: "auto" }}
          >
            {showCenterGuides ? (
              <div className="pointer-events-none absolute inset-0 z-[2]">
                <div className="absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2 bg-white/12" />
                <div className="absolute top-1/2 left-0 right-0 h-px -translate-y-1/2 bg-white/12" />
              </div>
            ) : null}
            <video
              ref={setRefs}
              src={src}
              className="absolute inset-0 h-full w-full bg-black"
              preload="metadata"
              playsInline
              style={{
                objectFit: normalizedCanvas.fitMode === "cover" ? "cover" : "contain",
                transform:
                  normalizedCanvas.fitMode === "cover"
                    ? `translate(${normalizedCanvas.offsetX * 38}%, ${normalizedCanvas.offsetY * 38}%) scale(${normalizedCanvas.zoom})`
                    : undefined,
                transition: isDraggingFrame ? "none" : "transform 90ms linear",
              }}
              onDoubleClick={togglePlayPause}
            />

            {subtitlePreview?.lines?.length ? (
              <div
                className="absolute z-[4]"
                style={{
                  left: `${subtitleAnchorXPercent}%`,
                  top: `${subtitleAnchorYPercent}%`,
                  transform: `translate(-50%, ${subtitleTranslateY})`,
                  width: `${subtitleBoxWidthPercent}%`,
                  height: `${subtitleBoxHeightPx}px`,
                }}
              >
                <div
                  className={cn(
                    "pointer-events-none absolute inset-0 rounded-md border border-dashed bg-white/[0.03]",
                    isResizingSubtitle
                      ? "border-zinc-100/60"
                      : isDraggingSubtitle
                        ? "border-white/45"
                        : "border-white/28",
                  )}
                />
                {onCanvasChange
                  ? subtitleResizeHandles.map((handle) => (
                      <button
                        key={`subtitle-handle-${handle.id}`}
                        type="button"
                        title={t("workspace.clipSceneEditor.resizeSubtitleArea")}
                        className={cn(
                          "absolute z-[6] h-3.5 w-3.5 rounded-sm border border-zinc-100/50 bg-black/75",
                          handle.className,
                          handle.cursor,
                        )}
                        style={{ touchAction: "none" }}
                        onPointerDown={onSubtitleResizePointerDown(handle.id)}
                        onPointerMove={onSubtitleResizePointerMove}
                        onPointerUp={onSubtitleResizePointerUp}
                        onPointerCancel={onSubtitleResizePointerUp}
                      />
                    ))
                  : null}
                <div
                  className={cn(
                    "absolute inset-0 z-[5] flex items-end justify-center px-2",
                    onCanvasChange
                      ? isDraggingSubtitle
                        ? "cursor-grabbing"
                        : "cursor-grab"
                      : "pointer-events-none",
                  )}
                  style={{ touchAction: "none" }}
                  onPointerDown={onSubtitlePointerDown}
                  onPointerMove={onSubtitlePointerMove}
                  onPointerUp={onSubtitlePointerUp}
                  onPointerCancel={onSubtitlePointerUp}
                >
                  <div className="max-w-full space-y-0.5">
                    {subtitlePreview.lines.map((line, lineIndex) => (
                      <p
                        key={`stage-sub-${lineIndex}`}
                        className="text-center leading-tight"
                        style={{
                          fontFamily: resolveSubtitleFontCssFamily(
                            subtitlePreview.profile.fontFamily,
                          ),
                          fontSize: `${subtitleFontSize}px`,
                          fontWeight: subtitlePreview.profile.bold ? 700 : 500,
                          fontStyle: subtitlePreview.profile.italic ? "italic" : "normal",
                          letterSpacing: `${subtitlePreview.profile.letterSpacing ?? 0}px`,
                          lineHeight: subtitlePreview.profile.lineHeight || 1.12,
                          textShadow: `0 2px 0 ${subtitlePreview.profile.outlineColor ?? "#0A0D16"}, 0 0 10px ${subtitlePreview.profile.shadowColor ?? "#000000"}, 0 0 24px ${subtitlePreview.profile.shadowColor ?? "#000000"}`,
                        }}
                      >
                        {line.map((word, wordIndex) => (
                          <span
                            key={`stage-word-${lineIndex}-${wordIndex}`}
                            style={{
                              color: word.emphasized
                                ? subtitlePreview.profile.secondaryColor
                                : subtitlePreview.profile.primaryColor,
                              marginRight: wordIndex === line.length - 1 ? 0 : "0.3em",
                              transform: word.active ? "scale(1.03)" : "none",
                              display: "inline-block",
                              transition:
                                subtitlePreview.profile.animation === "word-pop" && word.active
                                  ? "transform 110ms ease-out"
                                  : "none",
                            }}
                          >
                            {word.text}
                          </span>
                        ))}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        {showControls ? (
          <section className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
            <div className="relative h-6">
              <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-white/10" />
              <div
                className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-gradient-to-r from-zinc-300/70 via-zinc-100/85 to-zinc-300/68"
                style={{
                  width: `${duration > 0 ? clamp((displayedTime / duration) * 100, 0, 100) : 0}%`,
                }}
              />
              <input
                type="range"
                min={0}
                max={Math.max(duration, 0.001)}
                step={0.01}
                value={displayedTime}
                onChange={(event) => {
                  const next = Number(event.currentTarget.value)
                  setDragTime(next)
                  if (!draggingTimeline) {
                    setTime(next)
                  }
                }}
                onPointerDown={() => setDraggingTimeline(true)}
                onPointerUp={(event) => {
                  const next = Number(event.currentTarget.value)
                  setDraggingTimeline(false)
                  setDragTime(null)
                  seekTo(next)
                }}
                onPointerCancel={() => {
                  setDraggingTimeline(false)
                  setDragTime(null)
                }}
                className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-zinc-100 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-zinc-100"
              />
            </div>

            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => seekTo((videoRef.current?.currentTime ?? 0) - 5)}
                  className="grid h-8 w-8 place-content-center rounded-md border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10 hover:text-zinc-100"
                >
                  <RewindIcon className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={togglePlayPause}
                  className="grid h-8 w-8 place-content-center rounded-md border border-white/12 bg-white/6 text-zinc-100 transition hover:bg-white/12"
                >
                  {playing ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4 pl-0.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => seekTo((videoRef.current?.currentTime ?? 0) + 5)}
                  className="grid h-8 w-8 place-content-center rounded-md border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10 hover:text-zinc-100"
                >
                  <FastForwardIcon className="size-3.5" />
                </button>
                <p className="ml-1 text-xs text-zinc-300">
                  {formatClock(displayedTime)} <span className="text-zinc-500">/ {formatClock(duration)}</span>
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {onNudgeLeft ? (
                  <button
                    type="button"
                    title={t("workspace.clipSceneEditor.nudgeLeft")}
                    className="grid h-7 w-7 place-content-center rounded-md border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10 hover:text-zinc-100"
                    onClick={onNudgeLeft}
                  >
                    ←
                  </button>
                ) : null}
                {onNudgeRight ? (
                  <button
                    type="button"
                    title={t("workspace.clipSceneEditor.nudgeRight")}
                    className="grid h-7 w-7 place-content-center rounded-md border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10 hover:text-zinc-100"
                    onClick={onNudgeRight}
                  >
                    →
                  </button>
                ) : null}
                {onTrimStart ? (
                  <button
                    type="button"
                    title={t("workspace.clipSceneEditor.trimStart")}
                    className="grid h-7 w-7 place-content-center rounded-md border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10 hover:text-zinc-100"
                    onClick={onTrimStart}
                  >
                    [
                  </button>
                ) : null}
                {onSplit ? (
                  <button
                    type="button"
                    title={t("workspace.clipSceneEditor.splitAtCurrent")}
                    className="grid h-7 w-7 place-content-center rounded-md border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10 hover:text-zinc-100"
                    onClick={onSplit}
                  >
                    S
                  </button>
                ) : null}
                {onTrimEnd ? (
                  <button
                    type="button"
                    title={t("workspace.clipSceneEditor.trimEnd")}
                    className="grid h-7 w-7 place-content-center rounded-md border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10 hover:text-zinc-100"
                    onClick={onTrimEnd}
                  >
                    ]
                  </button>
                ) : null}
                <p className="ml-1 text-[11px] text-zinc-500">
                  {t("workspace.clipSceneEditor.interactionHint", { resolution: normalizedCanvas.resolution })}
                </p>
              </div>
            </div>
          </section>
        ) : null}
      </div>
    )
  },
)
