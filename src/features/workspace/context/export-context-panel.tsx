import { DownloadIcon, FileTextIcon, SparklesIcon } from "lucide-react"

import { formatSeconds } from "@/app/mock-data"
import type { WorkspaceController } from "@/features/workspace/workspace-controller-types"
import { ShinyText } from "@/shared/react-bits/shiny-text"

type ExportContextPanelProps = {
  controller: WorkspaceController
}

export default function ExportContextPanel({ controller }: ExportContextPanelProps) {
  const { clips, ai } = controller
  const totalClipDuration = clips.reduce((sum, clip) => sum + (clip.end - clip.start), 0)

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-white/10 bg-black/26 p-3">
        <p className="text-xs tracking-[0.15em] text-zinc-500 uppercase">Экспортный контекст</p>
        <p className="mt-2 text-sm text-zinc-200">Клипов в очереди: {clips.length}</p>
        <p className="text-xs text-zinc-500">Суммарно: {formatSeconds(totalClipDuration)}</p>
      </div>

      <div className="rounded-xl border border-white/10 bg-black/24 p-3">
        <p className="flex items-center gap-1.5 text-xs tracking-[0.15em] text-zinc-500 uppercase">
          <FileTextIcon className="size-3.5 text-zinc-400" />
          Метаданные
        </p>
        <p className="mt-2 text-xs text-zinc-400">
          Для каждого клипа заполните заголовок, описание и теги прямо в разделе «Экспорт».
        </p>
      </div>

      <div className="rounded-xl border border-white/10 bg-black/24 p-3">
        <p className="flex items-center gap-1.5 text-xs tracking-[0.15em] text-zinc-500 uppercase">
          <DownloadIcon className="size-3.5 text-zinc-400" />
          Профиль вывода
        </p>
        <p className="mt-2 text-xs text-zinc-400">
          Платформы выбираются отдельно для каждого клипа и не смешиваются с остальными режимами.
        </p>
      </div>

      {(ai.isThumbnailing || ai.isHooking || ai.isScoring) ? (
        <div className="rounded-xl border border-white/10 bg-black/24 p-3">
          <p className="flex items-center gap-1.5 text-xs tracking-[0.15em] text-zinc-500 uppercase">
            <SparklesIcon className="size-3.5 text-zinc-400" />
            ИИ-обновление
          </p>
          <div className="mt-2">
            <ShinyText text="ИИ обновляет подсказки для метаданных..." speed={2.2} className="text-xs" />
          </div>
        </div>
      ) : null}
    </div>
  )
}
