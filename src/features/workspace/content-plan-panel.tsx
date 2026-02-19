import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ChevronDownIcon, CopyIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import type { ContentPlanIdea } from "@/app/types"
import { SpotlightCard } from "@/shared/react-bits/spotlight-card"
import { ShinyText } from "@/shared/react-bits/shiny-text"

type ContentPlanPanelProps = {
  ideas: ContentPlanIdea[]
  processing: boolean
}

export function ContentPlanPanel({ ideas, processing }: ContentPlanPanelProps) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState<string | null>(ideas[0]?.id ?? null)

  const copyPlan = async (idea: ContentPlanIdea) => {
    const payload = `${idea.title}\n${idea.angle}\n${t("contentPlanPanel.channelsPrefix")}: ${idea.channels.join(", ")}\n${idea.scriptOutline}`
    try {
      await navigator.clipboard.writeText(payload)
    } catch {
      // no-op
    }
  }

  return (
    <SpotlightCard className="min-w-0 rounded-xl border border-white/12 bg-black/28 p-3">
      <p className="text-xs tracking-[0.15em] text-zinc-500 uppercase">{t("contentPlanPanel.title")}</p>
      <p className="mt-1 text-xs text-zinc-400">
        {t("contentPlanPanel.description")}
      </p>
      {processing ? (
        <div className="mt-3 rounded-lg border border-white/10 bg-white/4 px-3 py-2">
          <ShinyText text={t("contentPlanPanel.processing")} speed={2.2} className="text-xs" />
        </div>
      ) : null}

      <div className="mt-3 space-y-2">
        {ideas.map((idea) => {
          const isOpen = expanded === idea.id
          return (
            <div key={idea.id} className="overflow-hidden rounded-lg border border-white/10 bg-white/4">
              <button
                onClick={() => setExpanded((prev) => (prev === idea.id ? null : idea.id))}
                className="flex w-full items-center justify-between px-3 py-2"
              >
                <div className="min-w-0 text-left">
                  <p className="text-sm break-words text-zinc-100">{idea.title}</p>
                  <p className="text-[11px] text-zinc-500">{idea.channels.join(" · ")}</p>
                </div>
                <motion.span animate={{ rotate: isOpen ? 180 : 0 }}>
                  <ChevronDownIcon className="size-4 text-zinc-500" />
                </motion.span>
              </button>

              <AnimatePresence initial={false}>
                {isOpen ? (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="border-t border-white/8 px-3 py-2"
                  >
                    <p className="text-xs break-words text-zinc-300">{idea.angle}</p>
                    <p className="mt-2 text-xs leading-relaxed break-words text-zinc-400">{idea.scriptOutline}</p>
                    <button
                      onClick={() => copyPlan(idea)}
                    className="mt-2 inline-flex items-center gap-1 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[11px] text-zinc-300 hover:bg-white/10"
                  >
                    <CopyIcon className="size-3" />
                    {t("contentPlanPanel.copyPlan")}
                  </button>
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
