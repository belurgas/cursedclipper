import { LightbulbIcon, SparklesIcon } from "lucide-react"

import type { Project } from "@/app/types"
import { Button } from "@/components/ui/button"
import { ProcessingPill } from "@/features/workspace/processing-pill"
import type { WorkspaceController } from "@/features/workspace/workspace-controller-types"

type InsightsContextPanelProps = {
  controller: WorkspaceController
  project: Project
}

export default function InsightsContextPanel({ controller, project }: InsightsContextPanelProps) {
  const { ai, media, transcript, clips, actions } = controller

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
          {project.sourceChannelFollowers ? <p>Подписчики: {project.sourceChannelFollowers}</p> : null}
          {project.sourceDurationSeconds ? (
            <p>Источник: ~{project.sourceDurationSeconds} с</p>
          ) : null}
          {project.sourceUploadDate ? <p>Дата публикации: {project.sourceUploadDate}</p> : null}
          {project.sourceViewCount ? <p>Просмотры: {project.sourceViewCount}</p> : null}
          {project.sourceLikeCount ? <p>Лайки: {project.sourceLikeCount}</p> : null}
          {project.sourceCommentCount ? <p>Комментарии: {project.sourceCommentCount}</p> : null}
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
