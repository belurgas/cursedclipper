import { motion } from "framer-motion"

import { ShinyText } from "@/shared/react-bits/shiny-text"

type ProcessingPillProps = {
  label: string
  processing: boolean
  readyLabel?: string
}

export function ProcessingPill({
  label,
  processing,
  readyLabel = "Готово",
}: ProcessingPillProps) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
      <p className="text-[11px] tracking-[0.12em] text-zinc-500 uppercase">{label}</p>
      <div className="mt-1.5 h-5 overflow-hidden">
        {processing ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2"
          >
            <span className="relative inline-flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-zinc-200/70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-zinc-300" />
            </span>
            <ShinyText text="Выполняется" speed={2.2} className="text-xs" />
          </motion.div>
        ) : (
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs text-zinc-300"
          >
            {readyLabel}
          </motion.p>
        )}
      </div>
    </div>
  )
}
