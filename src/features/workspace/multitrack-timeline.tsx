import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react"
import {
  LockIcon,
  MinusIcon,
  MonitorOffIcon,
  PencilLineIcon,
  PlusIcon,
  VolumeXIcon,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { formatSeconds } from "@/app/mock-data"
import type { ClipAssemblyItem, ClipAssemblyTrack, ClipAssemblyTrackType } from "@/app/types"

type MultitrackTimelineProps = {
  duration: number
  currentTime: number
  tracks: ClipAssemblyTrack[]
  activeTrackId: string | null
  activeItemId: string | null
  zoom: number
  onSeek: (time: number) => void
  onSetActiveTrack: (trackId: string | null) => void
  onSetActiveItem: (itemId: string | null) => void
  onSetZoom: (
    zoom: number,
    options?: {
      recordHistory?: boolean
    },
  ) => void
  onAddTrack: (type: ClipAssemblyTrackType) => void
  onRemoveTrack: (trackId: string) => void
  onRenameTrack: (trackId: string, name: string) => void
  onToggleTrackMute: (trackId: string) => void
  onToggleTrackLock: (trackId: string) => void
  onToggleTrackVisibility: (trackId: string) => void
  onItemRangeChange: (
    itemId: string,
    start: number,
    end: number,
    options?: {
      targetTrackId?: string | null
      recordHistory?: boolean
    },
  ) => void
  onMoveItemToNewVideoTrackAbove: (
    itemId: string,
    start: number,
    end: number,
    options?: {
      recordHistory?: boolean
    },
  ) => void
  subtitleOverlays?: Array<{
    id: string
    start: number
    end: number
    label?: string
  }>
  showSubtitleOverlays?: boolean
}

type DragMode = "move" | "resize-start" | "resize-end"

type DragState = {
  pointerId: number
  itemId: string
  sourceTrackId: string
  targetTrackId: string
  mode: DragMode
  startClientX: number
  startClientY: number
  initialStart: number
  initialEnd: number
  moved: boolean
  captureTarget: HTMLElement
  lastStart: number
  lastEnd: number
  lastTrackId: string
  createVideoTrackAbove: boolean
}

type ScrubState = {
  pointerId: number
  captureTarget: HTMLElement
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const MIN_ITEM_DURATION = 0.2
const MIN_TIMELINE_ZOOM = 0.03
const MAX_TIMELINE_ZOOM = 6

const isSourceCompatibleWithTrack = (
  sourceType: ClipAssemblyItem["sourceType"],
  trackType: ClipAssemblyTrackType,
) => {
  if (trackType === "video") {
    return sourceType === "clip" || sourceType === "video-file"
  }
  return sourceType === "audio-file"
}

const itemAccentClass = (item: ClipAssemblyItem, trackType: ClipAssemblyTrackType, isActive: boolean) => {
  if (trackType === "audio" || item.sourceType === "audio-file") {
    return isActive
      ? "border-emerald-200/80 bg-emerald-300/35"
      : "border-emerald-200/45 bg-emerald-300/20 hover:border-emerald-100/70 hover:bg-emerald-300/28"
  }
  if (item.sourceType === "video-file") {
    return isActive
      ? "border-sky-200/80 bg-sky-300/35"
      : "border-sky-200/45 bg-sky-300/20 hover:border-sky-100/70 hover:bg-sky-300/28"
  }
  return isActive
    ? "border-zinc-100/80 bg-zinc-200/40"
    : "border-zinc-200/45 bg-zinc-200/24 hover:border-zinc-100/70 hover:bg-zinc-200/34"
}

export function MultitrackTimeline({
  duration,
  currentTime,
  tracks,
  activeTrackId,
  activeItemId,
  zoom,
  onSeek,
  onSetActiveTrack,
  onSetActiveItem,
  onSetZoom,
  onAddTrack,
  onRemoveTrack,
  onRenameTrack,
  onToggleTrackMute,
  onToggleTrackLock,
  onToggleTrackVisibility,
  onItemRangeChange,
  onMoveItemToNewVideoTrackAbove,
  subtitleOverlays = [],
  showSubtitleOverlays = false,
}: MultitrackTimelineProps) {
  const { t } = useTranslation()
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null)
  const [showCreateTrackHint, setShowCreateTrackHint] = useState(false)
  const dragStateRef = useRef<DragState | null>(null)
  const scrubStateRef = useRef<ScrubState | null>(null)
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const verticalScrollRef = useRef<HTMLDivElement | null>(null)
  const trackInfoColumnRef = useRef<HTMLDivElement | null>(null)
  const timelineViewportRef = useRef<HTMLDivElement | null>(null)
  const pendingRangeRef = useRef<{
    itemId: string
    start: number
    end: number
    targetTrackId: string
  } | null>(null)
  const rangeRafRef = useRef<number | null>(null)
  const zoomCommitTimeoutRef = useRef<number | null>(null)
  const zoomAnchorRef = useRef<{
    time: number
    pointerX: number
  } | null>(null)

  const totalDuration = useMemo(() => {
    const maxItemEnd = tracks.reduce(
      (maxTrackEnd, track) =>
        Math.max(
          maxTrackEnd,
          track.items.reduce((maxItemEndValue, item) => Math.max(maxItemEndValue, item.timelineEnd), 0),
        ),
      0,
    )
    return Math.max(duration, maxItemEnd, 20)
  }, [duration, tracks])

  const pixelsPerSecond = 58 * clamp(zoom, MIN_TIMELINE_ZOOM, MAX_TIMELINE_ZOOM)
  const timelineWidth = Math.max(720, totalDuration * pixelsPerSecond)
  const toPixels = (time: number) => clamp(time, 0, totalDuration) * pixelsPerSecond
  const toSeconds = (pixels: number) => clamp(pixels / pixelsPerSecond, 0, totalDuration)

  const markerStep = useMemo(() => {
    let step = 1
    while (totalDuration / step > 360) {
      step *= 2
    }
    return step
  }, [totalDuration])
  const markerValues = useMemo(() => {
    const values: number[] = []
    for (let second = 0; second <= totalDuration; second += markerStep) {
      values.push(second)
    }
    return values
  }, [markerStep, totalDuration])
  const majorEvery = markerStep * 4

  const normalizedSubtitleOverlays = useMemo(
    () =>
      subtitleOverlays
        .filter((item) => Number.isFinite(item.start) && Number.isFinite(item.end))
        .map((item) => ({
          ...item,
          start: clamp(Math.min(item.start, item.end), 0, totalDuration),
          end: clamp(Math.max(item.start, item.end), 0, totalDuration),
        }))
        .filter((item) => item.end - item.start >= 0.04),
    [subtitleOverlays, totalDuration],
  )

  useEffect(() => {
    return () => {
      if (rangeRafRef.current) {
        window.cancelAnimationFrame(rangeRafRef.current)
        rangeRafRef.current = null
      }
      if (zoomCommitTimeoutRef.current) {
        window.clearTimeout(zoomCommitTimeoutRef.current)
        zoomCommitTimeoutRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    const anchor = zoomAnchorRef.current
    const viewport = timelineViewportRef.current
    if (!anchor || !viewport) {
      return
    }
    const rect = viewport.getBoundingClientRect()
    const pointerOffset = clamp(anchor.pointerX, 0, rect.width)
    const targetScrollLeft = anchor.time * pixelsPerSecond - pointerOffset
    const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth)
    viewport.scrollLeft = clamp(targetScrollLeft, 0, maxScrollLeft)
    zoomAnchorRef.current = null
  }, [pixelsPerSecond, timelineWidth])

  const dispatchRangeChange = (
    itemId: string,
    nextStart: number,
    nextEnd: number,
    targetTrackId: string,
    options?: {
      recordHistory?: boolean
    },
  ) => {
    const safeStart = clamp(Math.min(nextStart, nextEnd), 0, totalDuration)
    const safeEnd = clamp(
      Math.max(nextStart, nextEnd),
      Math.min(totalDuration, safeStart + MIN_ITEM_DURATION),
      totalDuration,
    )
    if (options?.recordHistory) {
      if (rangeRafRef.current) {
        window.cancelAnimationFrame(rangeRafRef.current)
        rangeRafRef.current = null
      }
      pendingRangeRef.current = null
      onItemRangeChange(itemId, safeStart, safeEnd, {
        targetTrackId,
        recordHistory: true,
      })
      return
    }
    pendingRangeRef.current = {
      itemId,
      start: safeStart,
      end: safeEnd,
      targetTrackId,
    }
    if (!rangeRafRef.current) {
      rangeRafRef.current = window.requestAnimationFrame(() => {
        rangeRafRef.current = null
        const pending = pendingRangeRef.current
        pendingRangeRef.current = null
        if (!pending) {
          return
        }
        onItemRangeChange(pending.itemId, pending.start, pending.end, {
          targetTrackId: pending.targetTrackId,
          recordHistory: false,
        })
      })
    }
  }

  const resolveTargetTrackId = (clientY: number, item: ClipAssemblyItem) => {
    for (const track of tracks) {
      const row = rowRefs.current[track.id]
      if (!row || track.locked) {
        continue
      }
      if (!isSourceCompatibleWithTrack(item.sourceType, track.type)) {
        continue
      }
      const rect = row.getBoundingClientRect()
      if (clientY >= rect.top && clientY <= rect.bottom) {
        return track.id
      }
    }
    return null
  }

  const canCreateVideoTrackAbove = (item: ClipAssemblyItem) =>
    item.sourceType === "clip" || item.sourceType === "video-file"

  const updateDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragStateRef.current
    if (!drag || drag.pointerId !== event.pointerId) {
      return
    }
    const sourceTrack = tracks.find((track) => track.id === drag.sourceTrackId)
    const sourceItem = sourceTrack?.items.find((item) => item.id === drag.itemId)
    if (!sourceTrack || !sourceItem) {
      return
    }
    const signedDeltaSeconds = (event.clientX - drag.startClientX) / pixelsPerSecond

    let nextStart = drag.initialStart
    let nextEnd = drag.initialEnd
    if (drag.mode === "move") {
      const length = Math.max(MIN_ITEM_DURATION, drag.initialEnd - drag.initialStart)
      const unclampedStart = drag.initialStart + signedDeltaSeconds
      nextStart = clamp(unclampedStart, 0, Math.max(0, totalDuration - length))
      nextEnd = nextStart + length
    } else if (drag.mode === "resize-start") {
      const maxStart = drag.initialEnd - MIN_ITEM_DURATION
      nextStart = clamp(drag.initialStart + signedDeltaSeconds, 0, Math.max(0, maxStart))
      nextEnd = drag.initialEnd
    } else {
      const minEnd = drag.initialStart + MIN_ITEM_DURATION
      nextStart = drag.initialStart
      nextEnd = clamp(drag.initialEnd + signedDeltaSeconds, minEnd, totalDuration)
    }

    let nextTrackId = drag.targetTrackId
    let shouldCreateVideoTrack = false
    if (drag.mode === "move") {
      const compatibleTrackId = resolveTargetTrackId(event.clientY, sourceItem)
      if (compatibleTrackId) {
        nextTrackId = compatibleTrackId
      } else {
        const topVideoRowTop = tracks
          .filter((track) => track.type === "video")
          .reduce<number | null>((top, track) => {
            const row = rowRefs.current[track.id]
            if (!row) {
              return top
            }
            const rowTop = row.getBoundingClientRect().top
            return top === null ? rowTop : Math.min(top, rowTop)
          }, null)
        if (
          topVideoRowTop !== null &&
          event.clientY < topVideoRowTop - 10 &&
          canCreateVideoTrackAbove(sourceItem)
        ) {
          shouldCreateVideoTrack = true
          nextTrackId = drag.sourceTrackId
        }
      }
    }

    drag.createVideoTrackAbove = shouldCreateVideoTrack
    setShowCreateTrackHint(shouldCreateVideoTrack)
    drag.targetTrackId = nextTrackId
    drag.lastStart = nextStart
    drag.lastEnd = nextEnd
    drag.lastTrackId = nextTrackId
    if (
      Math.abs(nextStart - drag.initialStart) > 0.01 ||
      Math.abs(nextEnd - drag.initialEnd) > 0.01 ||
      nextTrackId !== drag.sourceTrackId ||
      shouldCreateVideoTrack
    ) {
      drag.moved = true
    }

    dispatchRangeChange(drag.itemId, nextStart, nextEnd, nextTrackId, { recordHistory: false })
  }

  const finishDrag = (pointerId: number, commit: boolean) => {
    const drag = dragStateRef.current
    if (!drag || drag.pointerId !== pointerId) {
      return
    }
    if (drag.captureTarget.hasPointerCapture(pointerId)) {
      drag.captureTarget.releasePointerCapture(pointerId)
    }
    dragStateRef.current = null
    setDraggingItemId(null)
    setShowCreateTrackHint(false)
    if (!commit) {
      return
    }
    if (!drag.moved) {
      onSetActiveItem(drag.itemId)
      onSetActiveTrack(drag.sourceTrackId)
      return
    }
    if (drag.createVideoTrackAbove) {
      onMoveItemToNewVideoTrackAbove(drag.itemId, drag.lastStart, drag.lastEnd, {
        recordHistory: true,
      })
      return
    }
    dispatchRangeChange(drag.itemId, drag.lastStart, drag.lastEnd, drag.lastTrackId, {
      recordHistory: true,
    })
  }

  const startDrag = (
    event: ReactPointerEvent<HTMLElement>,
    track: ClipAssemblyTrack,
    item: ClipAssemblyItem,
    mode: DragMode,
  ) => {
    if (track.locked) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    const captureTarget = event.currentTarget
    dragStateRef.current = {
      pointerId: event.pointerId,
      itemId: item.id,
      sourceTrackId: track.id,
      targetTrackId: track.id,
      mode,
      startClientX: event.clientX,
      startClientY: event.clientY,
      initialStart: item.timelineStart,
      initialEnd: item.timelineEnd,
      moved: false,
      captureTarget,
      lastStart: item.timelineStart,
      lastEnd: item.timelineEnd,
      lastTrackId: track.id,
      createVideoTrackAbove: false,
    }
    setDraggingItemId(item.id)
    setShowCreateTrackHint(false)
    onSetActiveItem(item.id)
    onSetActiveTrack(track.id)
    captureTarget.setPointerCapture(event.pointerId)
  }

  const toSecondsFromClientX = (clientX: number) => {
    const viewport = timelineViewportRef.current
    if (!viewport) {
      return 0
    }
    const rect = viewport.getBoundingClientRect()
    const x = viewport.scrollLeft + (clientX - rect.left)
    return toSeconds(x)
  }

  const startScrub = (event: ReactPointerEvent<HTMLElement>) => {
    if (dragStateRef.current) {
      return
    }
    const captureTarget = event.currentTarget
    scrubStateRef.current = {
      pointerId: event.pointerId,
      captureTarget,
    }
    onSeek(toSecondsFromClientX(event.clientX))
    event.preventDefault()
    captureTarget.setPointerCapture(event.pointerId)
  }

  const updateScrub = (event: ReactPointerEvent<HTMLElement>) => {
    const scrub = scrubStateRef.current
    if (!scrub || scrub.pointerId !== event.pointerId) {
      return
    }
    onSeek(toSecondsFromClientX(event.clientX))
    event.preventDefault()
  }

  const finishScrub = (event: ReactPointerEvent<HTMLElement>) => {
    const scrub = scrubStateRef.current
    if (!scrub || scrub.pointerId !== event.pointerId) {
      return
    }
    if (scrub.captureTarget.hasPointerCapture(event.pointerId)) {
      scrub.captureTarget.releasePointerCapture(event.pointerId)
    }
    scrubStateRef.current = null
    event.preventDefault()
  }

  const handleTrackPanelWheel = useCallback((event: WheelEvent) => {
    const verticalScroller = verticalScrollRef.current
    if (!verticalScroller || event.ctrlKey) {
      return
    }
    if (Math.abs(event.deltaY) < 0.001) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    const maxScrollTop = Math.max(
      0,
      verticalScroller.scrollHeight - verticalScroller.clientHeight,
    )
    verticalScroller.scrollTop = clamp(
      verticalScroller.scrollTop + event.deltaY,
      0,
      maxScrollTop,
    )
  }, [])

  const handleTimelineWheel = useCallback((event: WheelEvent) => {
    const viewport = timelineViewportRef.current
    if (!viewport) {
      return
    }
    if (event.ctrlKey) {
      event.preventDefault()
      event.stopPropagation()
      const rect = viewport.getBoundingClientRect()
      const pointerX = clamp(event.clientX - rect.left, 0, rect.width)
      const anchorTime = clamp((viewport.scrollLeft + pointerX) / pixelsPerSecond, 0, totalDuration)
      const deltaMagnitude = clamp(Math.abs(event.deltaY) / 120, 0.35, 4)
      const stepFactor = Math.pow(1.12, deltaMagnitude)
      const nextZoom = clamp(
        event.deltaY > 0 ? zoom / stepFactor : zoom * stepFactor,
        MIN_TIMELINE_ZOOM,
        MAX_TIMELINE_ZOOM,
      )
      zoomAnchorRef.current = { time: anchorTime, pointerX }
      onSetZoom(nextZoom, { recordHistory: false })
      if (zoomCommitTimeoutRef.current) {
        window.clearTimeout(zoomCommitTimeoutRef.current)
      }
      zoomCommitTimeoutRef.current = window.setTimeout(() => {
        zoomCommitTimeoutRef.current = null
        onSetZoom(nextZoom, { recordHistory: true })
      }, 160)
      return
    }
    const dominantDelta =
      Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
    if (Math.abs(dominantDelta) < 0.001) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth)
    viewport.scrollLeft = clamp(viewport.scrollLeft + dominantDelta, 0, maxScrollLeft)
  }, [onSetZoom, pixelsPerSecond, totalDuration, zoom])

  useEffect(() => {
    const viewport = timelineViewportRef.current
    if (!viewport) {
      return
    }
    viewport.addEventListener("wheel", handleTimelineWheel, { passive: false })
    return () => {
      viewport.removeEventListener("wheel", handleTimelineWheel)
    }
  }, [handleTimelineWheel])

  useEffect(() => {
    const trackColumn = trackInfoColumnRef.current
    if (!trackColumn) {
      return
    }
    trackColumn.addEventListener("wheel", handleTrackPanelWheel, { passive: false })
    return () => {
      trackColumn.removeEventListener("wheel", handleTrackPanelWheel)
    }
  }, [handleTrackPanelWheel])

  const createTrackHintVisible = Boolean(draggingItemId && showCreateTrackHint)

  return (
    <div className="h-full min-h-0 overflow-hidden rounded-xl border border-white/10 bg-black/24">
      <div
        ref={verticalScrollRef}
        className="h-full min-h-0 overflow-y-auto overflow-x-hidden pb-2"
      >
        <div className="grid min-w-full grid-cols-[220px_minmax(720px,1fr)]">
          <div ref={trackInfoColumnRef} className="border-r border-white/10 bg-black/30">
            <div className="flex h-7 items-center justify-between gap-1 border-b border-white/10 px-2">
              <p className="text-[11px] uppercase tracking-[0.12em] text-zinc-500">{t("workspace.multitrackTimeline.tracks")}</p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onAddTrack("video")}
                  className="inline-flex items-center gap-0.5 rounded-md border border-white/15 bg-white/5 px-1.5 py-0.5 text-[10px] text-zinc-200 transition hover:bg-white/10"
                  title={t("workspace.multitrackTimeline.addVideoTrack")}
                >
                  <PlusIcon className="size-3" />
                  V
                </button>
                <button
                  type="button"
                  onClick={() => onAddTrack("audio")}
                  className="inline-flex items-center gap-0.5 rounded-md border border-white/15 bg-white/5 px-1.5 py-0.5 text-[10px] text-zinc-200 transition hover:bg-white/10"
                  title={t("workspace.multitrackTimeline.addAudioTrack")}
                >
                  <PlusIcon className="size-3" />
                  A
                </button>
              </div>
            </div>
            {showSubtitleOverlays ? (
              <div className="flex h-6 items-center border-b border-white/10 px-2 text-[10px] text-zinc-500">
                {t("workspace.multitrackTimeline.subtitleOverlayLane")}
              </div>
            ) : null}
            {tracks.map((track) => (
              <div
                key={track.id}
                className={[
                  "h-[62px] border-b border-white/10 px-2 py-1.5",
                  activeTrackId === track.id ? "bg-white/7" : "bg-transparent",
                ].join(" ")}
              >
                <div className="flex items-center justify-between gap-1">
                  <button
                    type="button"
                    onClick={() => onSetActiveTrack(track.id)}
                    className="truncate text-left text-xs text-zinc-100"
                  >
                    {track.name}
                  </button>
                  <button
                    type="button"
                    title={t("workspace.multitrackTimeline.renameTrack")}
                    className="rounded-sm border border-white/10 bg-white/5 px-1 text-[10px] text-zinc-300 transition hover:bg-white/10"
                    onClick={() => {
                      const next = window.prompt(t("workspace.multitrackTimeline.renameTrackPrompt"), track.name)
                      if (next && next.trim()) {
                        onRenameTrack(track.id, next)
                      }
                    }}
                  >
                    <PencilLineIcon className="size-3" />
                  </button>
                </div>
                <div className="mt-1.5 flex items-center gap-1">
                  <button
                    type="button"
                    title={t("workspace.multitrackTimeline.mute")}
                    onClick={() => onToggleTrackMute(track.id)}
                    className={[
                      "grid h-6 w-6 place-content-center rounded border text-zinc-300 transition",
                      track.muted
                        ? "border-amber-200/60 bg-amber-200/20"
                        : "border-white/10 bg-white/5 hover:bg-white/10",
                    ].join(" ")}
                  >
                    <VolumeXIcon className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    title={t("workspace.multitrackTimeline.lock")}
                    onClick={() => onToggleTrackLock(track.id)}
                    className={[
                      "grid h-6 w-6 place-content-center rounded border text-zinc-300 transition",
                      track.locked
                        ? "border-rose-200/60 bg-rose-200/20"
                        : "border-white/10 bg-white/5 hover:bg-white/10",
                    ].join(" ")}
                  >
                    <LockIcon className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    title={t("workspace.multitrackTimeline.hideVideoTrack")}
                    onClick={() => onToggleTrackVisibility(track.id)}
                    className={[
                      "grid h-6 w-6 place-content-center rounded border text-zinc-300 transition",
                      track.hidden
                        ? "border-sky-200/60 bg-sky-200/20"
                        : "border-white/10 bg-white/5 hover:bg-white/10",
                    ].join(" ")}
                  >
                    <MonitorOffIcon className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    title={t("workspace.multitrackTimeline.deleteTrack")}
                    onClick={() => onRemoveTrack(track.id)}
                    className="grid h-6 w-6 place-content-center rounded border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10"
                  >
                    <MinusIcon className="size-3.5" />
                  </button>
                </div>
              </div>
            ))}
            <div className="h-2 border-b border-transparent" aria-hidden />
          </div>

          <div
            ref={timelineViewportRef}
            className="relative overflow-x-auto overflow-y-hidden"
          >
            <div className="relative" style={{ width: `${timelineWidth}px` }}>
              {createTrackHintVisible ? (
                <div className="pointer-events-none absolute left-0 right-0 top-0 z-[12] h-5 border-b border-sky-300/45 bg-sky-300/16">
                  <p className="px-2 py-0.5 text-[10px] text-sky-100">{t("workspace.multitrackTimeline.releaseToCreateVideoTrack")}</p>
                </div>
              ) : null}

              <div
                className="relative h-7 border-b border-white/10 bg-black/35"
                onPointerDown={startScrub}
                onPointerMove={updateScrub}
                onPointerUp={finishScrub}
                onPointerCancel={finishScrub}
              >
                {markerValues.map((second) => {
                  const left = toPixels(second)
                  const isMajor = second % majorEvery === 0
                  return (
                    <div
                      key={`marker-${second}`}
                      className="absolute top-0 bottom-0"
                      style={{ left: `${left}px` }}
                    >
                      <div
                        className={[
                          "absolute top-0 bottom-0 w-px",
                          isMajor ? "bg-white/18" : "bg-white/8",
                        ].join(" ")}
                      />
                      {isMajor ? (
                        <span className="absolute left-1 top-0.5 text-[10px] text-zinc-500">
                          {formatSeconds(second)}
                        </span>
                      ) : null}
                    </div>
                  )
                })}
              </div>

              {showSubtitleOverlays ? (
                <div
                  className="relative h-6 border-b border-white/10 bg-black/30"
                  onPointerDown={startScrub}
                  onPointerMove={updateScrub}
                  onPointerUp={finishScrub}
                  onPointerCancel={finishScrub}
                >
                  {normalizedSubtitleOverlays.map((overlay) => {
                    const left = toPixels(overlay.start)
                    const width = Math.max(toPixels(overlay.end) - left, 3)
                    return (
                      <div
                        key={overlay.id}
                        className="absolute top-1/2 h-3.5 -translate-y-1/2 rounded border border-amber-200/45 bg-amber-300/30"
                        style={{
                          left: `${left}px`,
                          width: `${width}px`,
                        }}
                        title={overlay.label ?? t("workspace.multitrackTimeline.subtitleDefault")}
                      />
                    )
                  })}
                </div>
              ) : null}

              <div
                className="pointer-events-none absolute top-0 bottom-0 z-[10] w-[2px] bg-zinc-100/85"
                style={{ left: `${toPixels(currentTime)}px` }}
              />
              <button
                type="button"
                className="absolute top-0 z-[11] h-4 w-4 -translate-x-1/2 rounded-full border border-zinc-100/65 bg-zinc-100/90 shadow-[0_0_0_1px_rgba(0,0,0,0.25)]"
                style={{ left: `${toPixels(currentTime)}px` }}
                title={t("workspace.multitrackTimeline.playheadPosition")}
                onPointerDown={startScrub}
                onPointerMove={updateScrub}
                onPointerUp={finishScrub}
                onPointerCancel={finishScrub}
              />

              {tracks.map((track) => (
                <div
                  key={`lane-${track.id}`}
                  ref={(node) => {
                    rowRefs.current[track.id] = node
                  }}
                  className={[
                    "relative h-[62px] border-b border-white/10",
                    activeTrackId === track.id ? "bg-white/4" : "bg-black/20",
                  ].join(" ")}
                  onPointerDown={(event) => {
                    onSetActiveTrack(track.id)
                    startScrub(event)
                  }}
                  onPointerMove={updateScrub}
                  onPointerUp={finishScrub}
                  onPointerCancel={finishScrub}
                >
                  {track.items.map((item) => {
                    const left = toPixels(item.timelineStart)
                    const width = Math.max(toPixels(item.timelineEnd) - left, 10)
                    const isActive = item.id === activeItemId
                    const isDragging = draggingItemId === item.id
                    return (
                      <div
                        key={item.id}
                        data-item-id={item.id}
                        className={[
                          "absolute top-1/2 h-9 -translate-y-1/2 rounded-md border text-xs text-zinc-100 shadow-[0_8px_20px_-14px_rgba(0,0,0,0.8)]",
                          itemAccentClass(item, track.type, isActive || isDragging),
                          track.locked ? "cursor-not-allowed opacity-70" : "cursor-grab active:cursor-grabbing",
                        ].join(" ")}
                        style={{
                          left: `${left}px`,
                          width: `${width}px`,
                        }}
                        onPointerDown={(event) => startDrag(event, track, item, "move")}
                        onPointerMove={updateDrag}
                        onPointerUp={(event) => finishDrag(event.pointerId, true)}
                        onPointerCancel={(event) => finishDrag(event.pointerId, false)}
                        onClick={(event) => {
                          event.stopPropagation()
                          onSetActiveTrack(track.id)
                          onSetActiveItem(item.id)
                        }}
                        title={`${item.label} · ${formatSeconds(item.timelineStart)} - ${formatSeconds(item.timelineEnd)}`}
                      >
                        {!track.locked ? (
                          <>
                            <button
                              type="button"
                              data-handle="start"
                              onPointerDown={(event) => startDrag(event, track, item, "resize-start")}
                              className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize rounded-l-md bg-white/14 hover:bg-white/20"
                            />
                            <button
                              type="button"
                              data-handle="end"
                              onPointerDown={(event) => startDrag(event, track, item, "resize-end")}
                              className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize rounded-r-md bg-white/14 hover:bg-white/20"
                            />
                          </>
                        ) : null}
                        <p className="truncate px-3 py-2 text-[11px]">{item.label}</p>
                      </div>
                    )
                  })}
                </div>
              ))}
              <div className="h-2 border-b border-transparent" aria-hidden />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
