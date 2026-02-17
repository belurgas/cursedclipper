import { useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ChevronDownIcon } from "lucide-react"

import type { ViralInsight } from "@/app/types"
import { SpotlightCard } from "@/shared/react-bits/spotlight-card"
import { ShinyText } from "@/shared/react-bits/shiny-text"

type ViralScorePanelProps = {
  score: number | null
  insights: ViralInsight[]
  processing: boolean
}

const circumference = 2 * Math.PI * 46

const impactColor: Record<ViralInsight["impact"], string> = {
  High: "text-zinc-100",
  Medium: "text-zinc-300",
  Low: "text-zinc-400",
}

const impactText: Record<ViralInsight["impact"], string> = {
  High: "Высокое влияние",
  Medium: "Среднее влияние",
  Low: "Низкое влияние",
}

export function ViralScorePanel({
  score,
  insights,
  processing,
}: ViralScorePanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(insights[0]?.id ?? null)

  const meterProgress = useMemo(() => {
    if (score === null) {
      return 0
    }
    return Math.max(0, Math.min(100, score))
  }, [score])

  const strokeOffset = circumference - (meterProgress / 100) * circumference

  return (
    <SpotlightCard className="min-w-0 rounded-xl border border-white/12 bg-black/28 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs tracking-[0.15em] text-zinc-500 uppercase">Виральный индекс</p>
        {processing ? (
          <ShinyText text="Анализируем поведенческие сигналы..." speed={2.4} className="text-xs" />
        ) : null}
      </div>

      <div className="mt-3 flex min-w-0 items-center gap-4">
        <div className="relative h-28 w-28 shrink-0">
          <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
            <circle
              cx="60"
              cy="60"
              r="46"
              stroke="rgba(255,255,255,0.14)"
              strokeWidth="10"
              fill="transparent"
            />
            <motion.circle
              cx="60"
              cy="60"
              r="46"
              stroke="url(#scoreGradient)"
              strokeWidth="10"
              strokeLinecap="round"
              fill="transparent"
              strokeDasharray={circumference}
              animate={{ strokeDashoffset: strokeOffset }}
              transition={{ duration: 0.7, ease: "easeOut" }}
            />
            <defs>
              <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#a5afc0" />
                <stop offset="50%" stopColor="#e8edf7" />
                <stop offset="100%" stopColor="#8a97b0" />
              </linearGradient>
            </defs>
          </svg>
          <div className="pointer-events-none absolute inset-0 grid place-content-center">
            <motion.p
              key={score ?? "pending"}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-2xl font-semibold text-zinc-100"
            >
              {score ?? "--"}
            </motion.p>
            <p className="text-center text-[11px] text-zinc-500">/ 100</p>
          </div>
        </div>

        <div className="min-w-0 space-y-2">
          <p className="text-sm leading-relaxed break-words text-zinc-300">
            {processing
              ? "ИИ оценивает хуки удержания, ритм подачи и вероятность повторных просмотров."
              : "Индекс объединяет силу старта, плотность нарратива и потенциал повторного просмотра."}
          </p>
          <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
            <div className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-zinc-300">
              Хук
              <p className="mt-0.5 text-sm font-semibold text-zinc-100">
                {score ? Math.max(68, score - 4) : "--"}
              </p>
            </div>
            <div className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-zinc-300">
              Ритм
              <p className="mt-0.5 text-sm font-semibold text-zinc-100">
                {score ? Math.max(62, score - 8) : "--"}
              </p>
            </div>
            <div className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-zinc-300">
              Повтор
              <p className="mt-0.5 text-sm font-semibold text-zinc-100">
                {score ? Math.max(60, score - 6) : "--"}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {insights.map((insight) => {
          const expanded = expandedId === insight.id
          return (
            <div
              key={insight.id}
              className="overflow-hidden rounded-lg border border-white/10 bg-white/4"
            >
              <button
                onClick={() => setExpandedId((prev) => (prev === insight.id ? null : insight.id))}
                className="flex w-full items-center justify-between px-3 py-2 text-left"
              >
                <div className="min-w-0 pr-2">
                  <p className="text-sm break-words text-zinc-200">{insight.title}</p>
                  <p className={`text-xs ${impactColor[insight.impact]}`}>{impactText[insight.impact]}</p>
                </div>
                <motion.span animate={{ rotate: expanded ? 180 : 0 }}>
                  <ChevronDownIcon className="size-4 text-zinc-500" />
                </motion.span>
              </button>
              <AnimatePresence initial={false}>
                {expanded ? (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="border-t border-white/8 px-3 py-2 text-xs leading-relaxed text-zinc-400"
                  >
                    {insight.detail}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          )
        })}
      </div>
    </SpotlightCard>
  )
}
