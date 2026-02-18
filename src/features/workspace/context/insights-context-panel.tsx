import { LightbulbIcon, SparklesIcon } from "lucide-react"

import type { Project } from "@/app/types"
import { Button } from "@/components/ui/button"
import { ProcessingPill } from "@/features/workspace/processing-pill"
import type { WorkspaceController } from "@/features/workspace/workspace-controller-types"

type InsightsContextPanelProps = {
  controller: WorkspaceController
  project: Project
}

const formatMetric = (value?: number) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null
  }
  return new Intl.NumberFormat("ru-RU").format(Math.max(0, Math.round(value)))
}

const formatUploadDate = (value?: string) => {
  const trimmed = value?.trim()
  if (!trimmed) {
    return null
  }
  if (/^\d{8}$/.test(trimmed)) {
    const year = Number(trimmed.slice(0, 4))
    const month = Number(trimmed.slice(4, 6))
    const day = Number(trimmed.slice(6, 8))
    const candidate = new Date(year, month - 1, day)
    if (
      candidate.getFullYear() === year &&
      candidate.getMonth() === month - 1 &&
      candidate.getDate() === day
    ) {
      return new Intl.DateTimeFormat("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(candidate)
    }
  }
  return trimmed
}

export default function InsightsContextPanel({ controller, project }: InsightsContextPanelProps) {
  const { ai, media, transcript, clips, actions } = controller
  const sourceFollowers = formatMetric(project.sourceChannelFollowers)
  const sourceViews = formatMetric(project.sourceViewCount)
  const sourceLikes = formatMetric(project.sourceLikeCount)
  const sourceComments = formatMetric(project.sourceCommentCount)
  const sourceUploadDate = formatUploadDate(project.sourceUploadDate)

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-white/10 bg-black/26 p-3">
        <p className="flex items-center gap-2 text-xs tracking-[0.15em] text-zinc-500 uppercase">
          <LightbulbIcon className="size-3.5 text-zinc-400" />
          Контекст аналитики
        </p>
        <div className="mt-2 space-y-1.5 text-xs text-zinc-400">
          <p>Видео: {media.videoName || "не загружено"}</p>
          {project.sourceUploader ? <p>Канал: {project.sourceUploader}</p> : null}
          {sourceFollowers ? <p>Подписчики: {sourceFollowers}</p> : null}
          {typeof project.sourceDurationSeconds === "number" ? (
            <p>Источник: ~{project.sourceDurationSeconds} с</p>
          ) : null}
          {sourceUploadDate ? <p>Дата публикации: {sourceUploadDate}</p> : null}
          {sourceViews ? <p>Просмотры: {sourceViews}</p> : null}
          {sourceLikes ? <p>Лайки: {sourceLikes}</p> : null}
          {sourceComments ? <p>Комментарии: {sourceComments}</p> : null}
          <p>Слов: {transcript.words.length}</p>
          <p>Клипов: {clips.length}</p>
        </div>
      </div>

      <div className="grid gap-2">
        <ProcessingPill
          label="Скоринг"
          processing={ai.isScoring}
          readyLabel={ai.viralScore ? `Индекс ${ai.viralScore}` : "Ожидание данных"}
        />
        <ProcessingPill
          label="Хуки"
          processing={ai.isHooking}
          readyLabel={`Готово: ${ai.hookCandidates.length}`}
        />
        <ProcessingPill
          label="Контент-план"
          processing={ai.isPlanning}
          readyLabel={`Идеи: ${ai.contentPlanIdeas.length}`}
        />
      </div>

      <div className="rounded-xl border border-white/10 bg-black/24 p-3">
        <p className="flex items-center gap-2 text-xs tracking-[0.15em] text-zinc-500 uppercase">
          <SparklesIcon className="size-3.5 text-zinc-400" />
          Быстрое действие
        </p>
        <Button
          size="sm"
          variant="outline"
          className="mt-2 w-full border-white/15 bg-transparent text-zinc-200 hover:bg-white/8"
          onClick={actions.regenerateHooks}
        >
          Пересчитать хуки
        </Button>
      </div>
    </div>
  )
}
