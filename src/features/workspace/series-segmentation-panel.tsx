import { motion } from "framer-motion"

import { formatSeconds } from "@/app/mock-data"
import type { SeriesSegment } from "@/app/types"
import { SpotlightCard } from "@/shared/react-bits/spotlight-card"
import { ShinyText } from "@/shared/react-bits/shiny-text"

type SeriesSegmentationPanelProps = {
  segments: SeriesSegment[]
  processing: boolean
}

export function SeriesSegmentationPanel({
  segments,
  processing,
}: SeriesSegmentationPanelProps) {
  return (
    <SpotlightCard className="min-w-0 rounded-xl border border-white/12 bg-black/28 p-3">
      <p className="text-xs tracking-[0.15em] text-zinc-500 uppercase">Сегментация серии</p>
      <p className="mt-1 text-xs text-zinc-400">
        Эпизоды, автоматически собранные из смысловых блоков видео.
      </p>

      {processing ? (
        <div className="mt-3 rounded-lg border border-white/10 bg-white/4 px-3 py-2">
          <ShinyText text="Структурируем контент в эпизодические арки..." speed={2.3} className="text-xs" />
        </div>
      ) : null}

      <div className="mt-3 space-y-2">
        {segments.map((segment, index) => (
          <motion.div
            key={segment.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: index * 0.05 }}
            className="rounded-lg border border-white/10 bg-white/4 p-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium break-words text-zinc-100">{segment.title}</p>
              <span className="text-[11px] text-zinc-400">
                {formatSeconds(segment.start)} - {formatSeconds(segment.end)}
              </span>
            </div>
            <p className="mt-1 text-xs text-zinc-300">{segment.theme}</p>
            <p className="mt-1 text-xs leading-relaxed break-words text-zinc-500">{segment.rationale}</p>
          </motion.div>
        ))}
      </div>
    </SpotlightCard>
  )
}
