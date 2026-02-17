import { useEffect, useMemo, useRef, type RefObject } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ScissorsLineDashedIcon, Trash2Icon } from "lucide-react"

import { formatSeconds } from "@/app/mock-data"
import { Button } from "@/components/ui/button"
import { CustomVideoPlayer } from "@/features/workspace/custom-video-player"
import { SmartTimeline } from "@/features/workspace/smart-timeline"
import type { WorkspaceController } from "@/features/workspace/workspace-controller-types"

type ClipsModeProps = {
  controller: WorkspaceController
  videoRef: RefObject<HTMLVideoElement | null>
  onOpenCoverMode: () => void
  onOpenExportMode: () => void
}

export default function ClipsMode({
  controller,
  videoRef,
  onOpenCoverMode,
  onOpenExportMode,
}: ClipsModeProps) {
  const { clips, media, actions, semanticBlocks, ai } = controller
  const clipPreviewRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    if (!controller.activeClipId && clips.length > 0) {
      actions.setActiveClipId(clips[0].id)
    }
  }, [actions, clips, controller.activeClipId])

  const activeClip = useMemo(
    () => clips.find((clip) => clip.id === controller.activeClipId) ?? clips[0] ?? null,
    [clips, controller.activeClipId],
  )

  const selectClip = (clipId: string) => {
    const clip = clips.find((item) => item.id === clipId)
    actions.setActiveClipId(clipId)
    if (!clip) {
      return
    }
    const players = [clipPreviewRef.current, videoRef.current].filter(
      (player): player is HTMLVideoElement => Boolean(player),
    )
    for (const player of players) {
      player.currentTime = clip.start
    }
    actions.setCurrentTime(clip.start)
  }

  const handlePreviewTimeUpdate = (nextTime: number) => {
    actions.syncCurrentTime(nextTime)
    if (!activeClip) {
      return
    }
    if (nextTime < activeClip.end - 0.05) {
      return
    }
    const player = clipPreviewRef.current
    if (!player) {
      return
    }
    if (!player.paused) {
      player.pause()
    }
    const clipEnd = Math.max(activeClip.start, activeClip.end)
    if (Math.abs(player.currentTime - clipEnd) > 0.04) {
      player.currentTime = clipEnd
    }
    actions.setCurrentTime(clipEnd)
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="rounded-xl border border-white/10 bg-black/24 px-3 py-2">
        <p className="text-xs tracking-[0.15em] text-zinc-500 uppercase">Рабочее пространство клипов</p>
        <p className="mt-1 text-xs text-zinc-400">
          Редактирование сегментов и подготовка к отдельному этапу экспорта.
        </p>
      </div>

      {clips.length === 0 ? (
        <div className="grid h-full min-h-[420px] place-content-center gap-2 rounded-xl border border-white/10 bg-black/24 text-zinc-500">
          <ScissorsLineDashedIcon className="mx-auto size-5" />
          <p className="text-sm">Создайте клипы в режиме «Редактор».</p>
        </div>
      ) : (
        <>
          <SmartTimeline
            duration={media.duration}
            currentTime={media.currentTime}
            semanticBlocks={semanticBlocks}
            clips={clips}
            activeClipId={activeClip?.id ?? null}
            selection={null}
            onSeek={(time) => {
              const player = videoRef.current
              if (!player) {
                return
              }
              player.currentTime = time
              actions.setCurrentTime(time)
            }}
            onSelectionChange={() => {
              // В режиме клипов диапазон задается карточками и семантикой из редактора.
            }}
            onClipSelect={selectClip}
            allowRangeSelection={false}
            showSemanticBlocks={false}
            enableSemanticHover={false}
          />

          <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
            <section className="min-h-0 rounded-xl border border-white/10 bg-black/24 p-2.5">
              <p className="mb-2 text-xs tracking-[0.14em] text-zinc-500 uppercase">Список клипов</p>
              <div className="grid max-h-full gap-2 overflow-auto pr-1">
                <AnimatePresence mode="popLayout">
                  {clips.map((clip) => (
                    <motion.button
                      key={clip.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      onClick={() => selectClip(clip.id)}
                      className={[
                        "rounded-lg border px-3 py-2 text-left transition",
                        clip.id === activeClip?.id
                          ? "border-zinc-200/40 bg-zinc-100/12"
                          : "border-white/10 bg-white/6 hover:border-white/20",
                      ].join(" ")}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm text-zinc-100">{clip.title}</p>
                        <span className="text-[11px] text-zinc-400">
                          {formatSeconds(clip.start)} - {formatSeconds(clip.end)}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-white/8">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-zinc-300/70 via-zinc-100/80 to-zinc-300/65"
                          style={{
                            width: `${Math.max(
                              ((clip.end - clip.start) / Math.max(media.duration, 1)) * 100,
                              4,
                            )}%`,
                          }}
                        />
                      </div>
                    </motion.button>
                  ))}
                </AnimatePresence>
              </div>
            </section>

            <section className="min-h-0 space-y-3 overflow-auto pr-1">
              {media.videoUrl ? (
                <div className="rounded-xl border border-white/10 bg-black/26 p-2">
                  <CustomVideoPlayer
                    ref={clipPreviewRef}
                    src={media.videoUrl}
                    compact
                    className="overflow-hidden rounded-lg border border-white/10"
                    onTimeUpdate={handlePreviewTimeUpdate}
                    onDurationChange={(nextDuration) => {
                      if (nextDuration > 0 && Math.abs(media.duration - nextDuration) > 0.2) {
                        actions.setDuration(nextDuration)
                      }
                    }}
                  />
                </div>
              ) : null}

              {activeClip ? (
                <motion.article
                  key={activeClip.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl border border-white/10 bg-black/24 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-zinc-100">{activeClip.title}</p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {formatSeconds(activeClip.start)} - {formatSeconds(activeClip.end)} ·{" "}
                        {Math.max(1, Math.round(activeClip.end - activeClip.start))} с
                      </p>
                    </div>
                    <Button
                      size="xs"
                      variant="outline"
                      className="border-white/15 bg-transparent text-zinc-300 hover:bg-white/8"
                      onClick={() => actions.removeClip(activeClip.id)}
                    >
                      <Trash2Icon className="size-3.5" />
                      Удалить
                    </Button>
                  </div>

                </motion.article>
              ) : null}

              <article className="rounded-xl border border-white/10 bg-black/24 p-3">
                <p className="text-xs tracking-[0.14em] text-zinc-500 uppercase">Релизный пакет</p>
                <p className="mt-1 text-xs text-zinc-400">
                  Подберите стиль субтитров и обложку. Платформы и метаданные настраиваются в разделе «Экспорт».
                </p>

                <div className="mt-3">
                  <p className="text-xs text-zinc-500">Пресет субтитров</p>
                  <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                    {ai.subtitlePresets.map((preset) => {
                      const selected = preset.id === ai.activeSubtitlePresetId
                      return (
                        <button
                          key={preset.id}
                          onClick={() => actions.setActiveSubtitlePresetId(preset.id)}
                          className={[
                            "rounded-lg border px-2.5 py-2 text-left text-xs transition",
                            selected
                              ? "border-zinc-200/40 bg-zinc-100/12 text-zinc-100"
                              : "border-white/10 bg-white/6 text-zinc-300 hover:border-white/20",
                          ].join(" ")}
                        >
                          {preset.name}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="mt-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-zinc-500">Обложка</p>
                    <Button
                      size="xs"
                      variant="outline"
                      className="border-white/15 bg-transparent text-zinc-300 hover:bg-white/8"
                      onClick={onOpenCoverMode}
                    >
                      Открыть генератор
                    </Button>
                  </div>

                  {ai.thumbnailTemplates.length ? (
                    <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                      {ai.thumbnailTemplates.map((template) => {
                        const selected = template.id === ai.activeThumbnailTemplateId
                        return (
                          <button
                            key={template.id}
                            onClick={() => actions.setActiveThumbnailTemplateId(template.id)}
                            className={[
                              "rounded-lg border px-2.5 py-2 text-left text-xs transition",
                              selected
                                ? "border-zinc-200/40 bg-zinc-100/12 text-zinc-100"
                                : "border-white/10 bg-white/6 text-zinc-300 hover:border-white/20",
                            ].join(" ")}
                          >
                            {template.name}
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-zinc-500">Шаблоны обложек ещё генерируются.</p>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-white/15 bg-transparent text-zinc-200 hover:bg-white/8"
                    onClick={onOpenCoverMode}
                  >
                    Обложки
                  </Button>
                  <Button
                    size="sm"
                    className="bg-zinc-100 text-zinc-950 hover:bg-zinc-100/90"
                    onClick={onOpenExportMode}
                    disabled={clips.length === 0}
                  >
                    Экспортировать
                  </Button>
                </div>
              </article>
            </section>
          </div>
        </>
      )}
    </div>
  )
}
