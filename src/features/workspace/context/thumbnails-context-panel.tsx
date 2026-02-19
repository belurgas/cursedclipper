import { SparklesIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { SubtitlePresetsPanel } from "@/features/workspace/subtitle-presets-panel"
import type { WorkspaceController } from "@/features/workspace/workspace-controller-types"
import { ShinyText } from "@/shared/react-bits/shiny-text"

type ThumbnailsContextPanelProps = {
  controller: WorkspaceController
}

export default function ThumbnailsContextPanel({ controller }: ThumbnailsContextPanelProps) {
  const { t } = useTranslation()
  const { ai, actions } = controller
  const activeTemplate =
    ai.thumbnailTemplates.find((template) => template.id === ai.activeThumbnailTemplateId) ??
    ai.thumbnailTemplates[0]
  const activeTemplateLabel = activeTemplate
    ? t(`thumbnailTemplateCatalog.${activeTemplate.id}.name`, { defaultValue: activeTemplate.name })
    : t("thumbnailsContextPanel.templateUnavailable")

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-white/10 bg-black/26 p-3">
        <p className="text-xs tracking-[0.15em] text-zinc-500 uppercase">
          {t("thumbnailsContextPanel.coverContext")}
        </p>
        {ai.isThumbnailing ? (
          <div className="mt-2">
            <ShinyText
              text={t("thumbnailsContextPanel.aiRefining")}
              speed={2.2}
              className="text-xs"
            />
          </div>
        ) : (
          <p className="mt-2 text-sm text-zinc-200">
            {activeTemplateLabel}
          </p>
        )}
        <p className="mt-1 text-xs text-zinc-500">
          {t("thumbnailsContextPanel.activeTemplateApplied")}
        </p>
      </div>

      <SubtitlePresetsPanel
        presets={ai.subtitlePresets}
        activePresetId={ai.activeSubtitlePresetId}
        onSelect={actions.setActiveSubtitlePresetId}
      />

      <div className="rounded-xl border border-white/10 bg-black/24 p-3">
        <p className="flex items-center gap-2 text-xs tracking-[0.15em] text-zinc-500 uppercase">
          <SparklesIcon className="size-3.5 text-zinc-400" />
          {t("thumbnailsContextPanel.aiRecommendationTitle")}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-zinc-400">
          {t("thumbnailsContextPanel.aiRecommendationBody")}
        </p>
      </div>
    </div>
  )
}
