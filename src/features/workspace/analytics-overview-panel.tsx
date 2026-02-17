import type { ComponentType } from "react"
import { motion } from "framer-motion"
import { BarChart3Icon, Clock3Icon, MessageSquareTextIcon, SigmaIcon } from "lucide-react"

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
  sourceLikeCount?: number
  sourceCommentCount?: number
  sourceChannelFollowers?: number
}

type StatTileProps = {
  icon: ComponentType<{ className?: string }>
  label: string
  value: string
}

function StatTile({ icon: Icon, label, value }: StatTileProps) {
  return (
    <div className="min-w-0 rounded-lg border border-white/10 bg-black/24 px-3 py-2">
      <p className="flex items-center gap-1.5 text-[11px] text-zinc-500">
        <Icon className="size-3.5 text-zinc-400" />
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-zinc-100">{value}</p>
    </div>
  )
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
  sourceLikeCount,
  sourceCommentCount,
  sourceChannelFollowers,
}: AnalyticsOverviewPanelProps) {
  const completion = words.length > 0 ? Math.min(100, Math.round((visibleWordCount / words.length) * 100)) : 0

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
          <p className="text-xs tracking-[0.15em] text-zinc-500 uppercase">Обзор аналитики</p>
          <p className="mt-1 truncate text-sm text-zinc-200">{videoName || "Видео не загружено"}</p>
          <p className="mt-0.5 text-xs text-zinc-500 break-words">
            Структурная метрика контента, транскрипта и монтажного потенциала.
          </p>
          {(sourceLabel || sourceUploader || sourceDurationSeconds) ? (
            <p className="mt-1 text-[11px] text-zinc-500 break-words">
              Источник: {sourceLabel || "YouTube"}{sourceUploader ? ` • ${sourceUploader}` : ""}
              {sourceDurationSeconds ? ` • ~${sourceDurationSeconds} с` : ""}
            </p>
          ) : null}
        </div>
        <div className="rounded-md border border-white/10 bg-white/6 px-2.5 py-1.5 text-xs text-zinc-300">
          Транскрипция: {completion}%
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={Clock3Icon} label="Длительность" value={formatDurationLabel(duration)} />
        <StatTile icon={MessageSquareTextIcon} label="Слова" value={String(words.length)} />
        <StatTile icon={SigmaIcon} label="Семантические блоки" value={String(semanticBlocks.length)} />
        <StatTile icon={BarChart3Icon} label="Готовые клипы" value={String(clipsCount)} />
      </div>

      {(sourceViewCount || sourceLikeCount || sourceCommentCount || sourceChannelFollowers) ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile icon={BarChart3Icon} label="Просмотры" value={String(sourceViewCount ?? 0)} />
          <StatTile icon={BarChart3Icon} label="Лайки" value={String(sourceLikeCount ?? 0)} />
          <StatTile icon={BarChart3Icon} label="Комментарии" value={String(sourceCommentCount ?? 0)} />
          <StatTile icon={BarChart3Icon} label="Подписчики канала" value={String(sourceChannelFollowers ?? 0)} />
        </div>
      ) : null}

      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { key: "hook", label: "Хуки", value: semanticStats.hook },
          { key: "story", label: "Контекст", value: semanticStats.story },
          { key: "proof", label: "Доказательства", value: semanticStats.proof },
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
