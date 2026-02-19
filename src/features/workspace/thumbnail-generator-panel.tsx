import { motion } from "framer-motion"
import { WandSparklesIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { formatSeconds } from "@/app/mock-data"
import type { ThumbnailTemplate } from "@/app/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SpotlightCard } from "@/shared/react-bits/spotlight-card"
import { ShinyText } from "@/shared/react-bits/shiny-text"

type ThumbnailGeneratorPanelProps = {
  templates: ThumbnailTemplate[]
  activeTemplateId: string
  processing: boolean
  duration: number
  currentTime: number
  onGenerate: () => void
  onSelectTemplate: (id: string) => void
  onUpdateTemplate: (
    id: string,
    patch: Partial<Pick<ThumbnailTemplate, "overlayTitle" | "overlaySubtitle">>,
  ) => void
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export function ThumbnailGeneratorPanel({
  templates,
  activeTemplateId,
  processing,
  duration,
  currentTime,
  onGenerate,
  onSelectTemplate,
  onUpdateTemplate,
}: ThumbnailGeneratorPanelProps) {
  const { t } = useTranslation()
  const activeTemplate = templates.find((template) => template.id === activeTemplateId) ?? templates[0]
  const canGenerate = duration > 0 && !processing

  if (!activeTemplate) {
    return (
      <SpotlightCard className="min-w-0 rounded-xl border border-white/12 bg-black/28 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs tracking-[0.15em] text-zinc-500 uppercase">{t("thumbnailGeneratorPanel.autoCover")}</p>
            <p className="mt-1 text-xs text-zinc-400">
              {t("thumbnailGeneratorPanel.emptyDescription")}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={onGenerate}
            disabled={!canGenerate}
            className="border-white/15 bg-transparent text-zinc-200 hover:bg-white/10 disabled:opacity-50"
          >
            <WandSparklesIcon className="size-3.5" />
            {t("thumbnailGeneratorPanel.generate")}
          </Button>
        </div>
        <div className="mt-3 rounded-lg border border-white/10 bg-black/30 px-3 py-3 text-xs text-zinc-400">
          {duration > 0
            ? t("thumbnailGeneratorPanel.noTemplatesYet")
            : t("thumbnailGeneratorPanel.loadMetadataFirst")}
        </div>
      </SpotlightCard>
    )
  }

  const focusProgress = duration > 0 ? (activeTemplate.focusTime / duration) * 100 : 0
  const currentProgress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <SpotlightCard className="min-w-0 rounded-xl border border-white/12 bg-black/28 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs tracking-[0.15em] text-zinc-500 uppercase">{t("thumbnailGeneratorPanel.autoCover")}</p>
          <p className="mt-1 text-xs text-zinc-400">
            {t("thumbnailGeneratorPanel.description")}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={onGenerate}
          disabled={!canGenerate}
          className="border-white/15 bg-transparent text-zinc-200 hover:bg-white/10"
        >
          <WandSparklesIcon className="size-3.5" />
          {t("thumbnailGeneratorPanel.generate")}
        </Button>
      </div>

      {processing ? (
        <div className="mt-3 rounded-lg border border-white/10 bg-white/4 px-3 py-2">
          <ShinyText text={t("thumbnailGeneratorPanel.buildingVariants")} speed={2.2} className="text-xs" />
        </div>
      ) : null}

      <div className="mt-3 rounded-lg border border-white/10 bg-black/35 p-2.5">
        <div
          className="relative h-[clamp(200px,33vh,380px)] overflow-hidden rounded-lg border border-white/12"
          style={{
            background: `linear-gradient(130deg, ${activeTemplate.palette[0]}22, ${activeTemplate.palette[1]}22)`,
          }}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.16),transparent_55%)]" />
          <div className="absolute inset-x-4 bottom-4 rounded-lg border border-white/15 bg-black/55 p-3 backdrop-blur-sm">
            <p className="text-sm font-semibold leading-tight text-zinc-100">
              {activeTemplate.overlayTitle}
            </p>
            <p className="mt-1 text-xs text-zinc-300">{activeTemplate.overlaySubtitle}</p>
          </div>

          <motion.div
            className="absolute top-0 bottom-0 w-[2px] bg-zinc-100/90"
            animate={{ left: `${clamp(focusProgress, 0, 100)}%` }}
            transition={{ duration: 0.45, ease: "easeOut" }}
          />
          <motion.div
            className="absolute top-0 bottom-0 w-[1px] bg-zinc-300/70"
            animate={{ left: `${clamp(currentProgress, 0, 100)}%` }}
            transition={{ duration: 0.15, ease: "linear" }}
          />
          <div className="absolute top-2 right-2 rounded-md border border-white/12 bg-black/55 px-2 py-1 text-[11px] text-zinc-300">
            {t("thumbnailGeneratorPanel.focusAt", { time: formatSeconds(activeTemplate.focusTime) })}
          </div>
        </div>

        <div className="mt-3 grid gap-2">
          <Input
            value={activeTemplate.overlayTitle}
            onChange={(event) =>
              onUpdateTemplate(activeTemplate.id, { overlayTitle: event.target.value })
            }
            className="border-white/12 bg-black/20 text-sm"
            placeholder={t("thumbnailGeneratorPanel.titlePlaceholder")}
          />
          <Input
            value={activeTemplate.overlaySubtitle}
            onChange={(event) =>
              onUpdateTemplate(activeTemplate.id, { overlaySubtitle: event.target.value })
            }
            className="border-white/12 bg-black/20 text-sm"
            placeholder={t("thumbnailGeneratorPanel.subtitlePlaceholder")}
          />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
          {templates.map((template) => {
            const selected = template.id === activeTemplateId
            const templateName = t(`thumbnailTemplateCatalog.${template.id}.name`, {
              defaultValue: template.name,
            })
            return (
              <button
                key={template.id}
                onClick={() => onSelectTemplate(template.id)}
                className={[
                  "rounded-md border p-2 text-left text-[11px] transition",
                  selected
                    ? "border-zinc-200/45 bg-zinc-100/12 text-zinc-100"
                    : "border-white/10 bg-white/4 text-zinc-400 hover:border-white/20",
                ].join(" ")}
                title={templateName}
              >
                <span className="block truncate">{templateName}</span>
              </button>
            )
          })}
        </div>
      </div>
    </SpotlightCard>
  )
}
