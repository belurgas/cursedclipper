import { DownloadIcon, ImageIcon, TypeIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { WorkspaceController } from "@/features/workspace/workspace-controller-types"

type ClipsContextPanelProps = {
  controller: WorkspaceController
  onOpenExportMode: () => void
}

export default function ClipsContextPanel({
  controller,
  onOpenExportMode,
}: ClipsContextPanelProps) {
  const { clips, ai } = controller
  const totalClipDuration = clips.reduce((sum, clip) => sum + (clip.end - clip.start), 0)
  const activeTemplate =
    ai.thumbnailTemplates.find((template) => template.id === ai.activeThumbnailTemplateId) ??
    ai.thumbnailTemplates[0]

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-white/10 bg-black/26 p-3">
        <p className="text-xs tracking-[0.15em] text-zinc-500 uppercase">Выход клипов</p>
        <p className="mt-2 text-sm text-zinc-200">Выбрано клипов: {clips.length}</p>
        <p className="text-xs text-zinc-500">Общая длительность: {Math.round(totalClipDuration)} с</p>
        <Button
          className="mt-3 w-full bg-zinc-100 text-zinc-950 hover:bg-zinc-100/90"
          disabled={clips.length === 0}
          onClick={onOpenExportMode}
        >
          <DownloadIcon className="size-4" />
          Открыть экспорт
        </Button>
      </div>

      <div className="rounded-xl border border-white/10 bg-black/24 p-3">
        <p className="text-xs tracking-[0.15em] text-zinc-500 uppercase">Пакет публикации</p>
        <div className="mt-2 space-y-2 text-xs">
          <div className="flex items-center gap-2 text-zinc-300">
            <TypeIcon className="size-3.5 text-zinc-400" />
            {ai.activeSubtitlePreset?.name ?? "Пресет субтитров не выбран"}
          </div>
          <div className="flex items-center gap-2 text-zinc-300">
            <ImageIcon className="size-3.5 text-zinc-400" />
            {activeTemplate?.name ?? "Шаблон обложки генерируется"}
          </div>
        </div>
      </div>

    </div>
  )
}
