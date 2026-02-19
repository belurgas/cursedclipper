import { DownloadIcon, FileTextIcon, SparklesIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { formatSeconds } from "@/app/mock-data"
import type { WorkspaceController } from "@/features/workspace/workspace-controller-types"
import { ShinyText } from "@/shared/react-bits/shiny-text"

type ExportContextPanelProps = {
  controller: WorkspaceController
}

export default function ExportContextPanel({ controller }: ExportContextPanelProps) {
  const { t } = useTranslation()
  const { clips, ai } = controller
  const totalClipDuration = clips.reduce((sum, clip) => sum + (clip.end - clip.start), 0)

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-white/10 bg-black/26 p-3">
        <p className="text-xs tracking-[0.15em] text-zinc-500 uppercase">{t("exportContextPanel.title")}</p>
        <p className="mt-2 text-sm text-zinc-200">{t("exportContextPanel.clipsQueued", { count: clips.length })}</p>
        <p className="text-xs text-zinc-500">{t("exportContextPanel.totalDuration", { duration: formatSeconds(totalClipDuration) })}</p>
      </div>

      <div className="rounded-xl border border-white/10 bg-black/24 p-3">
        <p className="flex items-center gap-1.5 text-xs tracking-[0.15em] text-zinc-500 uppercase">
          <FileTextIcon className="size-3.5 text-zinc-400" />
          {t("exportContextPanel.metadataTitle")}
        </p>
        <p className="mt-2 text-xs text-zinc-400">
          {t("exportContextPanel.metadataDescription")}
        </p>
      </div>

      <div className="rounded-xl border border-white/10 bg-black/24 p-3">
        <p className="flex items-center gap-1.5 text-xs tracking-[0.15em] text-zinc-500 uppercase">
          <DownloadIcon className="size-3.5 text-zinc-400" />
          {t("exportContextPanel.outputProfileTitle")}
        </p>
        <p className="mt-2 text-xs text-zinc-400">
          {t("exportContextPanel.outputProfileDescription")}
        </p>
      </div>

      {(ai.isThumbnailing || ai.isHooking || ai.isScoring) ? (
        <div className="rounded-xl border border-white/10 bg-black/24 p-3">
          <p className="flex items-center gap-1.5 text-xs tracking-[0.15em] text-zinc-500 uppercase">
            <SparklesIcon className="size-3.5 text-zinc-400" />
            {t("exportContextPanel.aiUpdateTitle")}
          </p>
          <div className="mt-2">
            <ShinyText text={t("exportContextPanel.aiUpdateDescription")} speed={2.2} className="text-xs" />
          </div>
        </div>
      ) : null}
    </div>
  )
}
