import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react"
import {
  ExpandIcon,
  Minimize2Icon,
  GaugeIcon,
  PauseIcon,
  PlayIcon,
  RewindIcon,
  FastForwardIcon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

type CustomVideoPlayerProps = {
  src: string
  className?: string
  compact?: boolean
  onTimeUpdate?: (time: number) => void
  onDurationChange?: (duration: number) => void
}

const playbackRateOptions = [0.75, 1, 1.25, 1.5, 2]

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

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

export const CustomVideoPlayer = forwardRef<HTMLVideoElement, CustomVideoPlayerProps>(
  function CustomVideoPlayer(
    { src, className, compact = false, onTimeUpdate, onDurationChange },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null)
    const videoRef = useRef<HTMLVideoElement | null>(null)
    const [playing, setPlaying] = useState(false)
    const [duration, setDuration] = useState(0)
    const [time, setTime] = useState(0)
    const [bufferedTime, setBufferedTime] = useState(0)
    const [rate, setRate] = useState(1)
    const [volume, setVolume] = useState(1)
    const [muted, setMuted] = useState(false)
    const [draggingTimeline, setDraggingTimeline] = useState(false)
    const [dragTime, setDragTime] = useState<number | null>(null)
    const [draggingVolume, setDraggingVolume] = useState(false)
    const [isFullscreen, setIsFullscreen] = useState(false)

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

    const durationSafe = Number.isFinite(duration) ? Math.max(0, duration) : 0
    const displayedTime = dragTime ?? time
    const playedPercent = durationSafe > 0 ? clamp((displayedTime / durationSafe) * 100, 0, 100) : 0
    const bufferedPercent = durationSafe > 0 ? clamp((bufferedTime / durationSafe) * 100, 0, 100) : 0
    const volumePercent = clamp(Math.round((muted ? 0 : volume) * 100), 0, 100)

    useEffect(() => {
      const video = videoRef.current
      if (!video) {
        return
      }

      const syncDuration = () => {
        const nextDuration = Number.isFinite(video.duration) ? video.duration : 0
        setDuration(nextDuration)
        onDurationChange?.(nextDuration)
      }

      const syncTime = () => {
        const nextTime = Number.isFinite(video.currentTime) ? video.currentTime : 0
        if (!draggingTimeline) {
          setTime(nextTime)
        }
        onTimeUpdate?.(nextTime)
      }

      const syncPlayback = () => setPlaying(!video.paused && !video.ended)
      const syncRate = () => setRate(video.playbackRate || 1)
      const syncVolume = () => {
        setVolume(video.volume)
        setMuted(video.muted)
      }

      const syncBuffer = () => {
        try {
          if (video.buffered.length === 0) {
            setBufferedTime(0)
            return
          }
          setBufferedTime(video.buffered.end(video.buffered.length - 1))
        } catch {
          setBufferedTime(0)
        }
      }

      video.addEventListener("loadedmetadata", syncDuration)
      video.addEventListener("durationchange", syncDuration)
      video.addEventListener("timeupdate", syncTime)
      video.addEventListener("progress", syncBuffer)
      video.addEventListener("play", syncPlayback)
      video.addEventListener("pause", syncPlayback)
      video.addEventListener("ended", syncPlayback)
      video.addEventListener("ratechange", syncRate)
      video.addEventListener("volumechange", syncVolume)

      syncDuration()
      syncTime()
      syncBuffer()
      syncPlayback()
      syncRate()
      syncVolume()

      return () => {
        video.removeEventListener("loadedmetadata", syncDuration)
        video.removeEventListener("durationchange", syncDuration)
        video.removeEventListener("timeupdate", syncTime)
        video.removeEventListener("progress", syncBuffer)
        video.removeEventListener("play", syncPlayback)
        video.removeEventListener("pause", syncPlayback)
        video.removeEventListener("ended", syncPlayback)
        video.removeEventListener("ratechange", syncRate)
        video.removeEventListener("volumechange", syncVolume)
      }
    }, [draggingTimeline, onDurationChange, onTimeUpdate, src])

    const seekTo = useCallback(
      (next: number) => {
        const video = videoRef.current
        if (!video) {
          return
        }
        const target = clamp(next, 0, durationSafe || 0)
        video.currentTime = target
        setTime(target)
        onTimeUpdate?.(target)
      },
      [durationSafe, onTimeUpdate],
    )

    const togglePlayPause = useCallback(() => {
      const video = videoRef.current
      if (!video) {
        return
      }
      if (video.paused || video.ended) {
        void video.play()
      } else {
        video.pause()
      }
    }, [])

    const skipBy = useCallback(
      (delta: number) => {
        const video = videoRef.current
        if (!video) {
          return
        }
        seekTo(video.currentTime + delta)
      },
      [seekTo],
    )

    const changeRate = useCallback((nextRate: number) => {
      const video = videoRef.current
      if (!video) {
        return
      }
      video.playbackRate = nextRate
      setRate(nextRate)
    }, [])

    const toggleMute = useCallback(() => {
      const video = videoRef.current
      if (!video) {
        return
      }
      video.muted = !video.muted
      setMuted(video.muted)
    }, [])

    const changeVolume = useCallback((nextRaw: number) => {
      const video = videoRef.current
      if (!video) {
        return
      }
      const next = clamp(nextRaw, 0, 1)
      video.volume = next
      video.muted = next <= 0.001
      setVolume(next)
      setMuted(video.muted)
    }, [])

    const toggleFullscreen = useCallback(() => {
      const container = containerRef.current
      if (!container) {
        return
      }
      if (document.fullscreenElement) {
        void document.exitFullscreen()
        return
      }
      void container.requestFullscreen()
    }, [])

    useEffect(() => {
      const onFullscreenChange = () => {
        const container = containerRef.current
        setIsFullscreen(Boolean(container && document.fullscreenElement === container))
      }
      document.addEventListener("fullscreenchange", onFullscreenChange)
      return () => document.removeEventListener("fullscreenchange", onFullscreenChange)
    }, [])

    const onTimelinePointerDown = useCallback(() => {
      setDraggingTimeline(true)
    }, [])

    const onTimelinePointerUp = useCallback(
      (event: PointerEvent<HTMLInputElement>) => {
        const next = Number(event.currentTarget.value)
        setDraggingTimeline(false)
        setDragTime(null)
        seekTo(next)
      },
      [seekTo],
    )

    const onTimelinePointerCancel = useCallback(() => {
      setDraggingTimeline(false)
      setDragTime(null)
    }, [])

    const onTimelineChange = useCallback((value: string) => {
      const next = Number(value)
      setDragTime(next)
      if (!draggingTimeline) {
        setTime(next)
      }
    }, [draggingTimeline])

    const onVolumePointerDown = useCallback(() => {
      setDraggingVolume(true)
    }, [])

    const onVolumePointerUp = useCallback(
      (event: PointerEvent<HTMLInputElement>) => {
        setDraggingVolume(false)
        changeVolume(Number(event.currentTarget.value) / 100)
      },
      [changeVolume],
    )

    const onVolumePointerCancel = useCallback(() => {
      setDraggingVolume(false)
    }, [])

    return (
      <>
        <style>{`
          .cf-player:fullscreen {
            width: 100vw;
            height: 100vh;
            max-width: 100vw;
            max-height: 100vh;
            display: grid;
            grid-template-rows: minmax(0, 1fr) auto;
            border-radius: 0;
            border: 0;
            background: #04060a;
          }

          .cf-player:fullscreen .cf-player-video-wrap {
            min-height: 0;
            display: flex;
            flex: 1 1 auto;
            height: auto;
            aspect-ratio: auto;
            align-items: center;
            justify-content: center;
            background: #020307;
          }

          .cf-player:fullscreen .cf-player-video {
            width: 100%;
            height: 100%;
            max-width: 100%;
            max-height: 100%;
            aspect-ratio: auto;
            object-fit: contain;
          }

          .cf-player:fullscreen .cf-player-controls {
            border-top: 1px solid rgba(255, 255, 255, 0.12);
            background: rgba(5, 8, 14, 0.84);
            backdrop-filter: blur(14px);
            padding-top: 10px;
            padding-bottom: 12px;
          }
        `}</style>

        <div
          ref={containerRef}
          className={cn(
            "cf-player group/player flex min-h-0 flex-col overflow-hidden rounded-xl border border-white/12 bg-black/70",
            className,
          )}
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === " ") {
              event.preventDefault()
              togglePlayPause()
              return
            }
            if (event.key === "ArrowLeft") {
              event.preventDefault()
              skipBy(-5)
              return
            }
            if (event.key === "ArrowRight") {
              event.preventDefault()
              skipBy(5)
              return
            }
            if (event.key === "Escape" && document.fullscreenElement) {
              void document.exitFullscreen()
            }
          }}
        >
        <div
          className={cn(
            "cf-player-video-wrap relative w-full shrink-0 overflow-hidden bg-black",
            compact
              ? "aspect-video min-h-[132px] max-h-[30vh] md:min-h-[150px] md:max-h-[34vh] xl:max-h-[38vh]"
              : "aspect-video min-h-[150px] max-h-[34vh] md:min-h-[170px] md:max-h-[38vh] xl:max-h-[44vh] 2xl:max-h-[48vh]",
          )}
        >
          <video
            ref={setRefs}
            src={src}
            className="cf-player-video absolute inset-0 h-full w-full bg-black object-contain"
            preload="metadata"
            playsInline
            onDoubleClick={toggleFullscreen}
          />
          <button
            type="button"
            onClick={togglePlayPause}
            className="absolute inset-0 grid place-content-center bg-black/0 transition hover:bg-black/20"
            aria-label={playing ? "Пауза" : "Воспроизведение"}
          >
            <span className="grid size-12 place-content-center rounded-full border border-white/25 bg-black/45 text-zinc-100 opacity-0 transition group-hover/player:opacity-100">
              {playing ? <PauseIcon className="size-5" /> : <PlayIcon className="size-5 pl-0.5" />}
            </span>
          </button>
        </div>

        <div className={cn("cf-player-controls border-t border-white/10 bg-black/55 px-3", compact ? "py-2" : "py-2.5")}>
          <div className="relative h-6">
            <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-white/10" />
            <div
              className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-white/14"
              style={{ width: `${bufferedPercent}%` }}
            />
            <div
              className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-gradient-to-r from-zinc-300/70 via-zinc-100/85 to-zinc-300/68"
              style={{ width: `${playedPercent}%` }}
            />
            <input
              type="range"
              min={0}
              max={Math.max(durationSafe, 0.001)}
              step={0.01}
              value={displayedTime}
              onChange={(event) => onTimelineChange(event.currentTarget.value)}
              onPointerDown={onTimelinePointerDown}
              onPointerUp={onTimelinePointerUp}
              onPointerCancel={onTimelinePointerCancel}
              onLostPointerCapture={onTimelinePointerCancel}
              className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-zinc-100 [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(229,236,248,0.85)] [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-zinc-100 [&::-moz-range-track]:bg-transparent"
            />
          </div>

          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={togglePlayPause}
                className="grid h-8 w-8 place-content-center rounded-md border border-white/12 bg-white/6 text-zinc-100 transition hover:bg-white/12"
                aria-label={playing ? "Пауза" : "Воспроизведение"}
              >
                {playing ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4 pl-0.5" />}
              </button>

              <button
                type="button"
                onClick={() => skipBy(-5)}
                className="grid h-8 w-8 place-content-center rounded-md border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10 hover:text-zinc-100"
                aria-label="Назад 5 сек"
                title="Назад 5 сек"
              >
                <RewindIcon className="size-3.5" />
              </button>

              <button
                type="button"
                onClick={() => skipBy(5)}
                className="grid h-8 w-8 place-content-center rounded-md border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10 hover:text-zinc-100"
                aria-label="Вперёд 5 сек"
                title="Вперёд 5 сек"
              >
                <FastForwardIcon className="size-3.5" />
              </button>

              <p className="ml-1 text-xs text-zinc-300">
                {formatClock(displayedTime)} <span className="text-zinc-500">/ {formatClock(durationSafe)}</span>
              </p>
            </div>

            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={toggleMute}
                  className="grid h-8 w-8 place-content-center rounded-md border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10 hover:text-zinc-100"
                  aria-label={muted || volume <= 0.001 ? "Включить звук" : "Выключить звук"}
                >
                  {muted || volume <= 0.001 ? (
                    <VolumeXIcon className="size-3.5" />
                  ) : (
                    <Volume2Icon className="size-3.5" />
                  )}
                </button>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={draggingVolume ? volumePercent : Math.round((muted ? 0 : volume) * 100)}
                  onChange={(event) => {
                    const next = Number(event.currentTarget.value)
                    if (draggingVolume) {
                      setVolume(next / 100)
                      setMuted(next <= 0)
                    } else {
                      changeVolume(next / 100)
                    }
                  }}
                  onPointerDown={onVolumePointerDown}
                  onPointerUp={onVolumePointerUp}
                  onPointerCancel={onVolumePointerCancel}
                  onLostPointerCapture={onVolumePointerCancel}
                  className="h-2 w-20 cursor-pointer appearance-none rounded-full bg-white/12 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-zinc-100 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-zinc-100"
                />
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-8 items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 text-xs text-zinc-200 transition hover:bg-white/10"
                  >
                    <GaugeIcon className="size-3.5 text-zinc-300" />
                    {rate.toFixed(rate % 1 === 0 ? 0 : 2)}x
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="z-[340] w-28 rounded-lg border-white/12 bg-[#0b0d12]/95 p-1"
                >
                  {playbackRateOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => changeRate(option)}
                      className={cn(
                        "w-full rounded-md px-2 py-1.5 text-left text-xs transition",
                        Math.abs(rate - option) < 0.001
                          ? "bg-zinc-100/14 text-zinc-100"
                          : "text-zinc-300 hover:bg-white/8",
                      )}
                    >
                      {option.toFixed(option % 1 === 0 ? 0 : 2)}x
                    </button>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <button
                type="button"
                onClick={toggleFullscreen}
                className="grid h-8 w-8 place-content-center rounded-md border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10 hover:text-zinc-100"
                aria-label={isFullscreen ? "Выйти из полного экрана" : "На весь экран"}
              >
                {isFullscreen ? (
                  <Minimize2Icon className="size-3.5" />
                ) : (
                  <ExpandIcon className="size-3.5" />
                )}
              </button>
            </div>
          </div>
        </div>
        </div>
      </>
    )
  },
)
