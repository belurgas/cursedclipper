import { useState, type RefObject } from "react"
import { MessageSquareTextIcon, ScissorsIcon, UploadIcon } from "lucide-react"

import { formatSeconds } from "@/app/mock-data"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CustomVideoPlayer } from "@/features/workspace/custom-video-player"
import { SemanticBlockTranscript } from "@/features/workspace/semantic-block-transcript"
import { SmartTimeline } from "@/features/workspace/smart-timeline"
import type { WorkspaceController } from "@/features/workspace/workspace-controller-types"
import { ShinyText } from "@/shared/react-bits/shiny-text"

type VideoModeProps = {
  controller: WorkspaceController
  videoRef: RefObject<HTMLVideoElement | null>
  onOpenFilePicker: () => void
}

function parseTimecode(raw: string): number | null {
  const value = raw.trim()
  if (!value) {
    return null
  }

  if (/^\d+(\.\d+)?$/.test(value)) {
    return Number(value)
  }

  const chunks = value.split(":").map((part) => part.trim())
  if (chunks.length < 2 || chunks.length > 3 || chunks.some((part) => !/^\d+$/.test(part))) {
    return null
  }

  const numbers = chunks.map(Number)
  if (chunks.length === 2) {
    const [mm, ss] = numbers
    return mm * 60 + ss
  }

  const [hh, mm, ss] = numbers
  return hh * 3600 + mm * 60 + ss
}

export default function VideoMode({
  controller,
  videoRef,
  onOpenFilePicker,
}: VideoModeProps) {
  const { media, transcript, clips, semanticBlocks, actions } = controller
  const [inspectorTab, setInspectorTab] = useState<"transcript" | "timecodes">("transcript")
  const [narrowPane, setNarrowPane] = useState<"canvas" | "inspector">("canvas")
  const [timecodeStart, setTimecodeStart] = useState("")
  const [timecodeEnd, setTimecodeEnd] = useState("")
  const [timecodeError, setTimecodeError] = useState("")
  const selectedStart = transcript.selection
    ? transcript.words[transcript.selection.start]?.start ?? 0
    : 0
  const selectedEnd = transcript.selection
    ? transcript.words[transcript.selection.end]?.end ?? 0
    : 0
  const selectedDuration = Math.max(0, selectedEnd - selectedStart)
  const hasSelection = Boolean(transcript.selection && selectedDuration >= 0.15)

  const seekTo = (time: number) => {
    const player = videoRef.current
    if (player) {
      player.currentTime = time
    }
    actions.setCurrentTime(time)
  }

  const renderEditorCanvas = () => (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto pr-1">
      <CustomVideoPlayer
        ref={videoRef}
        src={media.videoUrl}
        onTimeUpdate={actions.syncCurrentTime}
        onDurationChange={(nextDuration) => {
          if (nextDuration > 0 && Math.abs(media.duration - nextDuration) > 0.2) {
            actions.setDuration(nextDuration)
          }
        }}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/24 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm text-zinc-200">{media.videoName}</p>
          <p className="text-xs text-zinc-500">
            {formatSeconds(media.currentTime)} / {formatSeconds(media.duration)}
          </p>
        </div>
        {transcript.isTranscribing ? (
          <ShinyText text="ИИ формирует смысловые блоки..." speed={2.4} className="text-xs" />
        ) : null}
      </div>

      <SmartTimeline
        duration={media.duration}
        currentTime={media.currentTime}
        semanticBlocks={semanticBlocks}
        clips={clips}
        activeClipId={controller.activeClipId}
        selection={transcript.derivedTimeSelection}
        onSeek={(time) => {
          seekTo(time)
        }}
        onSelectionChange={actions.applyTimelineRange}
        onClipSelect={(clipId) => {
          actions.setActiveClipId(clipId)
          const clip = clips.find((candidate) => candidate.id === clipId)
          if (!clip) {
            return
          }
          seekTo(clip.start)
        }}
        interactiveClips={false}
      />

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/24 px-3 py-2">
        <div className="min-w-0">
          {hasSelection ? (
            <p className="truncate text-xs text-zinc-300">
              {formatSeconds(selectedStart)} - {formatSeconds(selectedEnd)} · Длительность:{" "}
              {selectedDuration.toFixed(1)} с
            </p>
          ) : (
            <p className="truncate text-xs text-zinc-500">
              Выделите слова в расшифровке или диапазон на таймлайне.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="xs"
            className="bg-zinc-100 text-zinc-950 hover:bg-zinc-100/90 disabled:bg-zinc-700/35 disabled:text-zinc-400"
            disabled={!hasSelection}
            onClick={actions.createClipFromSelection}
          >
            <ScissorsIcon className="size-3.5" />
            В клип
          </Button>
          <Button
            size="xs"
            variant="outline"
            className="border-white/12 bg-transparent text-zinc-300 hover:bg-white/8"
            disabled={!transcript.selection}
            onClick={actions.clearSelection}
          >
            Сброс
          </Button>
        </div>
      </div>

    </div>
  )

  const renderInspector = () => (
    <section className="min-h-0">
      <div className="flex h-full min-h-0 flex-col rounded-xl border border-white/12 bg-black/26">
        <div className="flex items-center gap-2 border-b border-white/10 p-2">
          <button
            onClick={() => setInspectorTab("transcript")}
            className={[
              "rounded-md px-2.5 py-1.5 text-xs transition",
              inspectorTab === "transcript"
                ? "bg-zinc-100/12 text-zinc-100"
                : "text-zinc-400 hover:bg-white/8 hover:text-zinc-200",
            ].join(" ")}
          >
            Расшифровка
          </button>
          <button
            onClick={() => setInspectorTab("timecodes")}
            className={[
              "rounded-md px-2.5 py-1.5 text-xs transition",
              inspectorTab === "timecodes"
                ? "bg-zinc-100/12 text-zinc-100"
                : "text-zinc-400 hover:bg-white/8 hover:text-zinc-200",
            ].join(" ")}
          >
            Таймкоды
          </button>
        </div>

        <div className="min-h-0 flex-1">
          {inspectorTab === "transcript" ? (
            <SemanticBlockTranscript
              blocks={transcript.visibleTranscriptBlocks}
              words={transcript.words}
              visibleWordCount={transcript.visibleWordCount}
              activeWordIndex={transcript.activeWordIndex}
              activeBlockId={transcript.activeTranscriptBlockId}
              selection={transcript.selection}
              isTranscribing={transcript.isTranscribing}
              onWordSelect={actions.selectWord}
              onBlockSelect={(startIndex, endIndex) => {
                actions.setSelectionRange(startIndex, endIndex)
                const time = transcript.words[startIndex]?.start ?? 0
                const player = videoRef.current
                if (!player) {
                  return
                }
                player.currentTime = time
                actions.setCurrentTime(time)
              }}
            />
          ) : inspectorTab === "timecodes" ? (
            <div className="h-full overflow-auto p-3">
              <div className="rounded-lg border border-white/10 bg-black/25 p-3">
                <p className="text-xs tracking-[0.14em] text-zinc-500 uppercase">
                  Клиппинг по таймкодам
                </p>
                <p className="mt-1 text-xs text-zinc-400">
                  Укажите старт и конец диапазона, затем создайте клип.
                </p>
              </div>

              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <Button
                  size="xs"
                  variant="outline"
                  className="border-white/15 bg-transparent text-zinc-300 hover:bg-white/8"
                  onClick={() => {
                    setTimecodeStart(formatSeconds(media.currentTime))
                    setTimecodeError("")
                  }}
                >
                  Старт = текущее время
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  className="border-white/15 bg-transparent text-zinc-300 hover:bg-white/8"
                  onClick={() => {
                    setTimecodeEnd(formatSeconds(media.currentTime))
                    setTimecodeError("")
                  }}
                >
                  Конец = текущее время
                </Button>
              </div>

              {transcript.selection ? (
                <Button
                  size="xs"
                  variant="outline"
                  className="mt-2 border-white/15 bg-transparent text-zinc-300 hover:bg-white/8"
                  onClick={() => {
                    const start = transcript.words[transcript.selection?.start ?? 0]?.start ?? 0
                    const end = transcript.words[transcript.selection?.end ?? 0]?.end ?? start
                    setTimecodeStart(formatSeconds(start))
                    setTimecodeEnd(formatSeconds(end))
                    setTimecodeError("")
                  }}
                >
                  Подставить текущее выделение
                </Button>
              ) : null}

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <p className="text-[11px] text-zinc-500">Начало</p>
                  <Input
                    value={timecodeStart}
                    onChange={(event) => {
                      setTimecodeStart(event.target.value)
                      setTimecodeError("")
                    }}
                    placeholder="00:12"
                    className="border-white/12 bg-black/22"
                  />
                </div>

                <div className="space-y-1.5">
                  <p className="text-[11px] text-zinc-500">Конец</p>
                  <Input
                    value={timecodeEnd}
                    onChange={(event) => {
                      setTimecodeEnd(event.target.value)
                      setTimecodeError("")
                    }}
                    placeholder="00:38"
                    className="border-white/12 bg-black/22"
                  />
                </div>
              </div>

              <div className="mt-2 rounded-md border border-white/10 bg-white/4 px-3 py-2">
                <p className="text-[11px] text-zinc-500">Предпросмотр диапазона</p>
                <p className="mt-1 text-xs text-zinc-300">
                  {timecodeStart || "--:--"} - {timecodeEnd || "--:--"}
                </p>
              </div>

              {timecodeError ? (
                <p className="mt-2 text-xs text-rose-300/90">{timecodeError}</p>
              ) : null}

              <Button
                size="sm"
                className="mt-3 bg-zinc-100 text-zinc-950 hover:bg-zinc-100/90"
                onClick={() => {
                  const start = parseTimecode(timecodeStart)
                  const end = parseTimecode(timecodeEnd)
                  if (start === null || end === null) {
                    setTimecodeError("Некорректный формат таймкода.")
                    return
                  }
                  if (Math.abs(end - start) < 0.35) {
                    setTimecodeError("Диапазон слишком короткий для клипа.")
                    return
                  }
                  const clipId = actions.createClipFromTimeRange(start, end)
                  if (!clipId) {
                    setTimecodeError("Не удалось создать клип из этого диапазона.")
                    return
                  }
                  const seek = Math.min(start, end)
                  seekTo(seek)
                  setTimecodeError("")
                }}
              >
                Создать клип из таймкодов
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )

  return media.videoUrl ? (
    <div className="h-full min-h-0">
      <div className="flex h-full min-h-0 flex-col gap-3 xl:hidden">
        <div className="inline-flex w-full rounded-lg border border-white/10 bg-black/25 p-1">
          <button
            className={[
              "flex-1 rounded-md px-2.5 py-1.5 text-xs transition",
              narrowPane === "canvas"
                ? "bg-zinc-100/14 text-zinc-100"
                : "text-zinc-400 hover:bg-white/8 hover:text-zinc-200",
            ].join(" ")}
            onClick={() => setNarrowPane("canvas")}
          >
            Плеер и таймлайн
          </button>
          <button
            className={[
              "flex-1 rounded-md px-2.5 py-1.5 text-xs transition",
              narrowPane === "inspector"
                ? "bg-zinc-100/14 text-zinc-100"
                : "text-zinc-400 hover:bg-white/8 hover:text-zinc-200",
            ].join(" ")}
            onClick={() => setNarrowPane("inspector")}
          >
            Расшифровка и таймкоды
          </button>
        </div>

        <div className="min-h-0 flex-1">
          {narrowPane === "canvas" ? renderEditorCanvas() : renderInspector()}
        </div>
      </div>

      <div className="hidden h-full min-h-0 gap-3 xl:grid xl:grid-cols-[minmax(0,1.32fr)_minmax(320px,1fr)] 2xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,1fr)]">
        {renderEditorCanvas()}
        {renderInspector()}
      </div>
    </div>
  ) : (
    <button
      onClick={onOpenFilePicker}
      className="grid h-full min-h-[420px] place-content-center gap-3 rounded-xl border border-dashed border-white/18 bg-black/24 text-zinc-300 transition hover:border-white/28 hover:bg-white/4"
    >
      <UploadIcon className="mx-auto size-7 text-zinc-400" />
      <span className="text-sm">Загрузите исходное видео</span>
      <span className="max-w-sm text-center text-xs text-zinc-500">
        После загрузки ИИ автоматически запустит расшифровку и построит семантические блоки.
      </span>
      <span className="inline-flex items-center justify-center gap-1 text-[11px] text-zinc-500">
        <MessageSquareTextIcon className="size-3.5" />
        Текст и таймлайн работают в едином режиме.
      </span>
    </button>
  )
}
