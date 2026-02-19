import type { ComponentType } from "react"
import { motion } from "framer-motion"
import { BarChart3Icon, Clock3Icon, MessageSquareTextIcon, SigmaIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { formatDurationLabel } from "@/app/mock-data"
import type { SemanticBlock, TranscriptWord } from "@/app/types"
import { SpotlightCard } from "@/shared/react-bits/spotlight-card"

type AnalyticsOverviewPanelProps = {
  videoName: string
  duration: number
  words: TranscriptWord[]
  visibleWordCount: number
  semanticBlocks: SemanticBlock[]
  clipsCount: number
  sourceLabel?: string
  sourceUploader?: string
  sourceDurationSeconds?: number
  sourceViewCount?: number
  sourceViewCountPrevious?: number
  sourceLikeCount?: number
  sourceLikeCountPrevious?: number
  sourceCommentCount?: number
  sourceCommentCountPrevious?: number
  sourceChannelFollowers?: number
  sourceChannelFollowersPrevious?: number
  sourceMetricsUpdatedAt?: string
}

type StatTileProps = {
  icon: ComponentType<{ className?: string }>
  label: string
  value: string
  detail?: string
}

function StatTile({ icon: Icon, label, value, detail }: StatTileProps) {
  return (
    <div className="min-w-0 rounded-lg border border-white/10 bg-black/24 px-3 py-2">
      <p className="flex items-center gap-1.5 text-[11px] text-zinc-500">
        <Icon className="size-3.5 text-zinc-400" />
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-zinc-100">{value}</p>
      {detail ? <p className="mt-0.5 text-[11px] text-zinc-500">{detail}</p> : null}
    </div>
  )
}

const formatMetric = (value: number | undefined, locale: string) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "0"
  }
  return new Intl.NumberFormat(locale).format(Math.max(0, Math.round(value)))
}

const formatMetricDelta = (
  current: number | undefined,
  previous: number | undefined,
  locale: string,
  unchangedLabel: string,
  deltaFormatter: (value: string) => string,
) => {
  if (
    typeof current !== "number" ||
    !Number.isFinite(current) ||
    typeof previous !== "number" ||
    !Number.isFinite(previous)
  ) {
    return null
  }
  const delta = Math.round(current) - Math.round(previous)
  if (delta === 0) {
    return unchangedLabel
  }
  const prefix = delta > 0 ? "+" : ""
  return deltaFormatter(`${prefix}${new Intl.NumberFormat(locale).format(delta)}`)
}

const formatRefreshedAt = (value: string | undefined, locale: string) => {
  const trimmed = value?.trim()
  if (!trimmed) {
    return null
  }
  const parsed = new Date(trimmed)
  if (!Number.isNaN(parsed.getTime())) {
    return new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(parsed)
  }
  return trimmed
}

export function AnalyticsOverviewPanel({
  videoName,
  duration,
  words,
  visibleWordCount,
  semanticBlocks,
  clipsCount,
  sourceLabel,
  sourceUploader,
  sourceDurationSeconds,
  sourceViewCount,
  sourceViewCountPrevious,
  sourceLikeCount,
  sourceLikeCountPrevious,
  sourceCommentCount,
  sourceCommentCountPrevious,
  sourceChannelFollowers,
  sourceChannelFollowersPrevious,
  sourceMetricsUpdatedAt,
}: AnalyticsOverviewPanelProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language === "ru" ? "ru-RU" : "en-US"
  const completion = words.length > 0 ? Math.min(100, Math.round((visibleWordCount / words.length) * 100)) : 0
  const hasSourceSummary = Boolean(sourceLabel || sourceUploader) || typeof sourceDurationSeconds === "number"
  const hasSourceMetrics = [sourceViewCount, sourceLikeCount, sourceCommentCount, sourceChannelFollowers]
    .some((value) => typeof value === "number")
  const refreshedAt = formatRefreshedAt(sourceMetricsUpdatedAt, locale)

  const semanticStats = {
    hook: semanticBlocks.filter((block) => block.type === "hook").length,
    story: semanticBlocks.filter((block) => block.type === "story").length,
    proof: semanticBlocks.filter((block) => block.type === "proof").length,
    cta: semanticBlocks.filter((block) => block.type === "cta").length,
  }

  return (
    <SpotlightCard className="min-w-0 rounded-xl border border-white/12 bg-black/28 p-3 xl:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs tracking-[0.15em] text-zinc-500 uppercase">{t("analyticsOverview.title")}</p>
          <p className="mt-1 truncate text-sm text-zinc-200">{videoName || t("analyticsOverview.videoNotLoaded")}</p>
          <p className="mt-0.5 text-xs text-zinc-500 break-words">
            {t("analyticsOverview.summaryDescription")}
          </p>
          {hasSourceSummary ? (
            <p className="mt-1 text-[11px] text-zinc-500 break-words">
              {t("analyticsOverview.source")}: {sourceLabel || "YouTube"}{sourceUploader ? ` • ${sourceUploader}` : ""}
              {typeof sourceDurationSeconds === "number" ? t("analyticsOverview.sourceDuration", { seconds: sourceDurationSeconds }) : ""}
            </p>
          ) : null}
          {refreshedAt ? (
            <p className="mt-1 text-[11px] text-zinc-500 break-words">{t("analyticsOverview.metricsUpdated", { value: refreshedAt })}</p>
          ) : null}
        </div>
        <div className="rounded-md border border-white/10 bg-white/6 px-2.5 py-1.5 text-xs text-zinc-300">
          {t("analyticsOverview.transcription")}: {completion}%
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={Clock3Icon} label={t("analyticsOverview.duration")} value={formatDurationLabel(duration)} />
        <StatTile icon={MessageSquareTextIcon} label={t("analyticsOverview.words")} value={String(words.length)} />
        <StatTile icon={SigmaIcon} label={t("analyticsOverview.semanticBlocks")} value={String(semanticBlocks.length)} />
        <StatTile icon={BarChart3Icon} label={t("analyticsOverview.readyClips")} value={String(clipsCount)} />
      </div>

      {hasSourceMetrics ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            icon={BarChart3Icon}
            label={t("analyticsOverview.views")}
            value={formatMetric(sourceViewCount, locale)}
            detail={
              formatMetricDelta(
                sourceViewCount,
                sourceViewCountPrevious,
                locale,
                t("analyticsOverview.deltaUnchanged"),
                (value) => t("analyticsOverview.delta", { value }),
              ) ?? undefined
            }
          />
          <StatTile
            icon={BarChart3Icon}
            label={t("analyticsOverview.likes")}
            value={formatMetric(sourceLikeCount, locale)}
            detail={
              formatMetricDelta(
                sourceLikeCount,
                sourceLikeCountPrevious,
                locale,
                t("analyticsOverview.deltaUnchanged"),
                (value) => t("analyticsOverview.delta", { value }),
              ) ?? undefined
            }
          />
          <StatTile
            icon={BarChart3Icon}
            label={t("analyticsOverview.comments")}
            value={formatMetric(sourceCommentCount, locale)}
            detail={
              formatMetricDelta(
                sourceCommentCount,
                sourceCommentCountPrevious,
                locale,
                t("analyticsOverview.deltaUnchanged"),
                (value) => t("analyticsOverview.delta", { value }),
              ) ?? undefined
            }
          />
          <StatTile
            icon={BarChart3Icon}
            label={t("analyticsOverview.channelSubscribers")}
            value={formatMetric(sourceChannelFollowers, locale)}
            detail={
              formatMetricDelta(
                sourceChannelFollowers,
                sourceChannelFollowersPrevious,
                locale,
                t("analyticsOverview.deltaUnchanged"),
                (value) => t("analyticsOverview.delta", { value }),
              ) ?? undefined
            }
          />
        </div>
      ) : null}

      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { key: "hook", label: t("analyticsOverview.hooks"), value: semanticStats.hook },
          { key: "story", label: t("analyticsOverview.context"), value: semanticStats.story },
          { key: "proof", label: t("analyticsOverview.proof"), value: semanticStats.proof },
          { key: "cta", label: "CTA", value: semanticStats.cta },
        ].map((item, index) => (
          <motion.div
            key={item.key}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, delay: index * 0.04 }}
            className="rounded-lg border border-white/10 bg-white/5 p-2.5"
          >
            <p className="text-[11px] text-zinc-500">{item.label}</p>
            <p className="mt-1 text-sm font-medium text-zinc-100">{item.value}</p>
          </motion.div>
        ))}
      </div>
    </SpotlightCard>
  )
}
