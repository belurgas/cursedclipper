import { LightbulbIcon, SparklesIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import type { Project } from "@/app/types"
import { Button } from "@/components/ui/button"
import { ProcessingPill } from "@/features/workspace/processing-pill"
import type { WorkspaceController } from "@/features/workspace/workspace-controller-types"

type InsightsContextPanelProps = {
  controller: WorkspaceController
  project: Project
}

const formatMetric = (value: number | undefined, locale: string) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null
  }
  return new Intl.NumberFormat(locale).format(Math.max(0, Math.round(value)))
}

const formatUploadDate = (value: string | undefined, locale: string) => {
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
      return new Intl.DateTimeFormat(locale, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(candidate)
    }
  }
  return trimmed
}

const formatDateTime = (value: string | undefined, locale: string) => {
  const trimmed = value?.trim()
  if (!trimmed) {
    return null
  }
  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) {
    return trimmed
  }
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed)
}

export default function InsightsContextPanel({ controller, project }: InsightsContextPanelProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language === "ru" ? "ru-RU" : "en-US"
  const { ai, media, transcript, clips, actions } = controller
  const sourceFollowers = formatMetric(project.sourceChannelFollowers, locale)
  const sourceViews = formatMetric(project.sourceViewCount, locale)
  const sourceLikes = formatMetric(project.sourceLikeCount, locale)
  const sourceComments = formatMetric(project.sourceCommentCount, locale)
  const sourceUploadDate = formatUploadDate(project.sourceUploadDate, locale)
  const sourceMetricsUpdatedAt = formatDateTime(project.sourceMetricsUpdatedAt, locale)

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-white/10 bg-black/26 p-3">
        <p className="flex items-center gap-2 text-xs tracking-[0.15em] text-zinc-500 uppercase">
          <LightbulbIcon className="size-3.5 text-zinc-400" />
          {t("insightsContextPanel.title")}
        </p>
        <div className="mt-2 space-y-1.5 text-xs text-zinc-400">
          <p>{t("insightsContextPanel.video", { value: media.videoName || t("insightsContextPanel.notLoaded") })}</p>
          {project.sourceUploader ? <p>{t("insightsContextPanel.channel", { value: project.sourceUploader })}</p> : null}
          {sourceFollowers ? <p>{t("insightsContextPanel.subscribers", { value: sourceFollowers })}</p> : null}
          {typeof project.sourceDurationSeconds === "number" ? (
            <p>{t("insightsContextPanel.sourceDuration", { value: project.sourceDurationSeconds })}</p>
          ) : null}
          {sourceUploadDate ? <p>{t("insightsContextPanel.publishDate", { value: sourceUploadDate })}</p> : null}
          {sourceMetricsUpdatedAt ? <p>{t("insightsContextPanel.metricsUpdated", { value: sourceMetricsUpdatedAt })}</p> : null}
          {sourceViews ? <p>{t("insightsContextPanel.views", { value: sourceViews })}</p> : null}
          {sourceLikes ? <p>{t("insightsContextPanel.likes", { value: sourceLikes })}</p> : null}
          {sourceComments ? <p>{t("insightsContextPanel.comments", { value: sourceComments })}</p> : null}
          <p>{t("insightsContextPanel.words", { value: transcript.words.length })}</p>
          <p>{t("insightsContextPanel.clips", { value: clips.length })}</p>
        </div>
      </div>

      <div className="grid gap-2">
        <ProcessingPill
          label={t("insightsContextPanel.scoringLabel")}
          processing={ai.isScoring}
          readyLabel={ai.viralScore ? t("insightsContextPanel.scoringReady", { score: ai.viralScore }) : t("insightsContextPanel.waitingForData")}
        />
        <ProcessingPill
          label={t("insightsContextPanel.hooksLabel")}
          processing={ai.isHooking}
          readyLabel={t("insightsContextPanel.readyCount", { count: ai.hookCandidates.length })}
        />
        <ProcessingPill
          label={t("insightsContextPanel.contentPlanLabel")}
          processing={ai.isPlanning}
          readyLabel={t("insightsContextPanel.ideasCount", { count: ai.contentPlanIdeas.length })}
        />
      </div>

      <div className="rounded-xl border border-white/10 bg-black/24 p-3">
        <p className="flex items-center gap-2 text-xs tracking-[0.15em] text-zinc-500 uppercase">
          <SparklesIcon className="size-3.5 text-zinc-400" />
          {t("insightsContextPanel.quickActionTitle")}
        </p>
        <Button
          size="sm"
          variant="outline"
          className="mt-2 w-full border-white/15 bg-transparent text-zinc-200 hover:bg-white/8"
          onClick={actions.regenerateHooks}
        >
          {t("insightsContextPanel.recalculateHooks")}
        </Button>
      </div>
    </div>
  )
}
