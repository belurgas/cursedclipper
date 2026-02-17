import { useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"

import { formatSeconds } from "@/app/mock-data"
import type { ClipSegment, SemanticBlock } from "@/app/types"
import { getSemanticStyle } from "@/features/workspace/mock-ai"

type TimeRange = {
  start: number
  end: number
}

type SmartTimelineProps = {
  duration: number
  currentTime: number
  semanticBlocks: SemanticBlock[]
  clips: ClipSegment[]
  activeClipId?: string | null
  selection: TimeRange | null
  inPoint?: number | null
  outPoint?: number | null
  onSeek: (time: number) => void
  onSelectionChange: (range: TimeRange | null) => void
  onClipSelect?: (clipId: string) => void
  allowRangeSelection?: boolean
  showSemanticBlocks?: boolean
  interactiveClips?: boolean
  enableSemanticHover?: boolean
}

type HoverState = {
  block: SemanticBlock
  x: number
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const toPercent = (time: number, duration: number) => {
  if (duration <= 0) {
    return 0
  }
  return clamp((time / duration) * 100, 0, 100)
}

const normalizeRange = (start: number, end: number): TimeRange => ({
  start: Math.min(start, end),
  end: Math.max(start, end),
})

export function SmartTimeline({
  duration,
  currentTime,
  semanticBlocks,
  clips,
  activeClipId = null,
  selection,
  inPoint = null,
  outPoint = null,
  onSeek,
  onSelectionChange,
  onClipSelect,
  allowRangeSelection = true,
  showSemanticBlocks = true,
  interactiveClips = true,
  enableSemanticHover = true,
}: SmartTimelineProps) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const dragStartRef = useRef<number | null>(null)
  const previewRangeRef = useRef<TimeRange | null>(null)
  const rangeRafRef = useRef<number | null>(null)
  const hoverRafRef = useRef<number | null>(null)
  const pendingHoverRef = useRef<HoverState | null>(null)
  const lastRangePaintRef = useRef(0)

  const [dragging, setDragging] = useState(false)
  const [previewSelection, setPreviewSelection] = useState<TimeRange | null>(null)
  const [hover, setHover] = useState<HoverState | null>(null)

  const hasDuration = duration > 0

  const timeFromPointer = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect || !hasDuration) {
      return 0
    }
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1)
    return duration * ratio
  }

  const activeSelection = previewSelection ?? selection
  const normalizedInOut =
    typeof inPoint === "number" && typeof outPoint === "number"
      ? normalizeRange(inPoint, outPoint)
      : null

  const selectionWidth = useMemo(() => {
    if (!activeSelection) {
      return 0
    }
    return Math.max(
      toPercent(activeSelection.end, duration) - toPercent(activeSelection.start, duration),
      0.6,
    )
  }, [activeSelection, duration])

  const semanticTrackMetrics = useMemo(
    () =>
      showSemanticBlocks
        ? semanticBlocks.map((block) => {
            const start = toPercent(block.start, duration)
            const width = Math.max(toPercent(block.end, duration) - start, 0.8)
            return { block, start, width }
          })
        : [],
    [duration, semanticBlocks, showSemanticBlocks],
  )

  const clipTrackMetrics = useMemo(
    () =>
      clips.map((clip) => {
        const start = toPercent(clip.start, duration)
        const width = Math.max(toPercent(clip.end, duration) - start, 0.8)
        return { clip, start, width }
      }),
    [clips, duration],
  )

  useEffect(() => {
    return () => {
      if (rangeRafRef.current) {
        window.cancelAnimationFrame(rangeRafRef.current)
      }
      if (hoverRafRef.current) {
        window.cancelAnimationFrame(hoverRafRef.current)
      }
    }
  }, [])

  return (
    <div className="space-y-2 rounded-xl border border-white/12 bg-black/28 p-3">
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-valuemin={0}
        aria-valuemax={Math.max(duration, 1)}
        aria-valuenow={currentTime}
        className="relative h-14 select-none overflow-hidden rounded-lg border border-white/10 bg-zinc-950/70 outline-none focus-visible:ring-2 focus-visible:ring-zinc-300/45"
        style={{ touchAction: "none" }}
        onPointerDown={(event) => {
          if (!hasDuration) {
            return
          }
          if (!allowRangeSelection) {
            onSeek(timeFromPointer(event.clientX))
            return
          }
          const start = timeFromPointer(event.clientX)
          dragStartRef.current = start
          previewRangeRef.current = { start, end: start }
          setPreviewSelection({ start, end: start })
          setHover(null)
          setDragging(true)
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          const rect = trackRef.current?.getBoundingClientRect()
          if (!rect) {
            return
          }

          if (allowRangeSelection && dragging && dragStartRef.current !== null) {
            const end = timeFromPointer(event.clientX)
            const nextRange = normalizeRange(dragStartRef.current, end)
            const previousRange = previewRangeRef.current
            if (
              previousRange &&
              Math.abs(previousRange.start - nextRange.start) < 0.04 &&
              Math.abs(previousRange.end - nextRange.end) < 0.04
            ) {
              return
            }
            previewRangeRef.current = nextRange
            const now = performance.now()
            if (now - lastRangePaintRef.current < 24) {
              return
            }
            lastRangePaintRef.current = now
            if (!rangeRafRef.current) {
              rangeRafRef.current = window.requestAnimationFrame(() => {
                rangeRafRef.current = null
                setPreviewSelection(previewRangeRef.current)
              })
            }
            return
          }

          if (allowRangeSelection) {
            return
          }

          if (!enableSemanticHover || !showSemanticBlocks || semanticBlocks.length === 0) {
            pendingHoverRef.current = null
            if (hover) {
              setHover(null)
            }
            return
          }

          const pointerX = event.clientX - rect.left
          const ratio = clamp(pointerX / rect.width, 0, 1)
          const pointerTime = ratio * duration
          const activeBlock = semanticBlocks.find(
            (block) => pointerTime >= block.start && pointerTime <= block.end,
          )
          if (!activeBlock) {
            pendingHoverRef.current = null
            if (!hoverRafRef.current) {
              hoverRafRef.current = window.requestAnimationFrame(() => {
                hoverRafRef.current = null
                setHover(null)
              })
            }
            return
          }
          const nextHover = { block: activeBlock, x: pointerX }
          const currentHover = pendingHoverRef.current ?? hover
          const sameBlock = currentHover?.block.id === nextHover.block.id
          const samePosition = currentHover ? Math.abs(currentHover.x - nextHover.x) < 6 : false
          if (sameBlock && samePosition) {
            return
          }
          pendingHoverRef.current = nextHover
          if (!hoverRafRef.current) {
            hoverRafRef.current = window.requestAnimationFrame(() => {
              hoverRafRef.current = null
              setHover(pendingHoverRef.current)
            })
          }
        }}
        onPointerLeave={() => {
          if (!dragging) {
            pendingHoverRef.current = null
            setHover(null)
          }
        }}
        onPointerUp={(event) => {
          if (!hasDuration) {
            return
          }
          if (!allowRangeSelection) {
            return
          }

          const start = dragStartRef.current
          const end = previewRangeRef.current?.end ?? timeFromPointer(event.clientX)
          setDragging(false)
          lastRangePaintRef.current = 0
          dragStartRef.current = null
          previewRangeRef.current = null
          setPreviewSelection(null)
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId)
          }

          if (start === null) {
            return
          }

          const range = normalizeRange(start, end)
          if (Math.abs(range.end - range.start) < 0.35) {
            onSelectionChange(null)
            onSeek(end)
            return
          }
          onSelectionChange(range)
        }}
        onPointerCancel={(event) => {
          if (!allowRangeSelection) {
            return
          }
          setDragging(false)
          lastRangePaintRef.current = 0
          dragStartRef.current = null
          previewRangeRef.current = null
          setPreviewSelection(null)
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId)
          }
        }}
        onKeyDown={(event) => {
          if (!hasDuration) {
            return
          }
          if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
            return
          }
          event.preventDefault()
          const delta = event.key === "ArrowRight" ? 1.5 : -1.5
          onSeek(clamp(currentTime + delta, 0, duration))
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-zinc-600/15 via-zinc-100/10 to-zinc-600/15" />

        {normalizedInOut ? (
          <div
            className="absolute top-[8px] bottom-[8px] rounded-md border border-zinc-300/24 bg-zinc-100/8"
            style={{
              left: `${toPercent(normalizedInOut.start, duration)}%`,
              width: `${Math.max(
                toPercent(normalizedInOut.end, duration) -
                  toPercent(normalizedInOut.start, duration),
                0.6,
              )}%`,
            }}
          />
        ) : null}

        {semanticTrackMetrics.map(({ block, start, width }) => {
          const style = getSemanticStyle(block.type)
          return (
            <div
              key={block.id}
              className="absolute top-[6px] bottom-[6px] rounded-md border"
              style={{
                left: `${start}%`,
                width: `${width}%`,
                backgroundColor: style.bg,
                borderColor: style.border,
                boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.04), 0 0 18px -8px ${style.glow}`,
              }}
            />
          )
        })}

        {activeSelection ? (
          <div
            className="absolute top-[4px] bottom-[4px] rounded-md border border-zinc-200/55 bg-zinc-100/16"
            style={{
              left: `${toPercent(activeSelection.start, duration)}%`,
              width: `${selectionWidth}%`,
              willChange: dragging ? "transform, width, left" : "auto",
              boxShadow:
                "0 0 0 1px rgba(243,246,252,0.2), 0 0 14px -8px rgba(214,224,239,0.72)",
            }}
          />
        ) : null}

        {typeof inPoint === "number" ? (
          <div
            className="pointer-events-none absolute top-0 bottom-0 w-[2px] bg-zinc-300/80"
            style={{ left: `${toPercent(inPoint, duration)}%` }}
          >
            <span className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-[2px] rounded-sm border border-white/12 bg-black/65 px-1 py-0.5 text-[10px] text-zinc-200">
              I
            </span>
          </div>
        ) : null}

        {typeof outPoint === "number" ? (
          <div
            className="pointer-events-none absolute top-0 bottom-0 w-[2px] bg-zinc-100/90"
            style={{ left: `${toPercent(outPoint, duration)}%` }}
          >
            <span className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-[2px] rounded-sm border border-white/12 bg-black/65 px-1 py-0.5 text-[10px] text-zinc-200">
              O
            </span>
          </div>
        ) : null}

        {clipTrackMetrics.map(({ clip, start, width }) => (
          <div
            key={clip.id}
            onPointerDown={(event) => {
              if (!interactiveClips) {
                return
              }
              event.stopPropagation()
            }}
            onClick={() => {
              if (!interactiveClips) {
                return
              }
              onClipSelect?.(clip.id)
            }}
            className={[
              "absolute top-1 bottom-1 transform-gpu rounded-md border transition-colors duration-150",
              activeClipId === clip.id
                ? "border-zinc-100/70 bg-zinc-200/35"
                : "border-zinc-100/45 bg-zinc-200/22 hover:border-zinc-100/70 hover:bg-zinc-200/30",
              interactiveClips ? "cursor-pointer" : "pointer-events-none",
            ].join(" ")}
            style={{
              left: `${start}%`,
              width: `${width}%`,
              boxShadow:
                activeClipId === clip.id
                  ? "0 0 14px -7px rgba(219,227,240,0.9)"
                  : "0 0 8px -8px rgba(219,227,240,0.55)",
            }}
            title={`${clip.title}: ${formatSeconds(clip.start)} - ${formatSeconds(clip.end)}`}
          />
        ))}

        <div
          className="absolute top-0 bottom-0 w-[2px] bg-zinc-100"
          style={{
            left: `${toPercent(currentTime, duration)}%`,
            transition: dragging ? "none" : "left 80ms linear",
          }}
        />

        <AnimatePresence>
          {enableSemanticHover && hover ? (
            <motion.div
              key={hover.block.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="pointer-events-none absolute top-1 z-10 rounded-md border border-white/14 bg-black/70 px-2 py-1 text-[11px] text-zinc-200 backdrop-blur-md"
              style={{ left: `${hover.x}px`, transform: "translateX(-50%)" }}
            >
              {hover.block.label} · {hover.block.confidence}% точность
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="flex items-center justify-between text-[11px] text-zinc-500">
        <span>{formatSeconds(currentTime)}</span>
        <span>
          {activeSelection
            ? `${formatSeconds(activeSelection.start)} - ${formatSeconds(activeSelection.end)}`
            : allowRangeSelection
              ? "Потяните по таймлайну для выделения диапазона"
              : "Выберите клип на шкале или в списке"}
        </span>
        <span>{formatSeconds(duration)}</span>
      </div>
    </div>
  )
}
