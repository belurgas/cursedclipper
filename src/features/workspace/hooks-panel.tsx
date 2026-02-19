import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { CopyCheckIcon, CopyIcon, WandSparklesIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import type { HookCandidate } from "@/app/types"
import { Button } from "@/components/ui/button"
import { SpotlightCard } from "@/shared/react-bits/spotlight-card"
import { ShinyText } from "@/shared/react-bits/shiny-text"

type HooksPanelProps = {
  hooks: HookCandidate[]
  processing: boolean
  onGenerate: () => void
}

export function HooksPanel({ hooks, processing, onGenerate }: HooksPanelProps) {
  const { t } = useTranslation()
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const toneMap: Record<HookCandidate["tone"], string> = {
    Bold: t("hooksPanel.tones.bold"),
    Direct: t("hooksPanel.tones.direct"),
    Reflective: t("hooksPanel.tones.reflective"),
    "Data-led": t("hooksPanel.tones.dataLed"),
  }

  const copyText = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(id)
      window.setTimeout(() => setCopiedId(null), 1200)
    } catch {
      setCopiedId(null)
    }
  }

  return (
    <SpotlightCard className="min-w-0 rounded-xl border border-white/12 bg-black/28 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs tracking-[0.15em] text-zinc-500 uppercase">{t("hooksPanel.title")}</p>
          <p className="mt-1 text-xs text-zinc-400">
            {t("hooksPanel.description")}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={onGenerate}
          className="border-white/15 bg-transparent text-zinc-200 hover:bg-white/10"
        >
          <WandSparklesIcon className="size-3.5" />
          {t("hooksPanel.refresh")}
        </Button>
      </div>

      {processing ? (
        <div className="mt-3 rounded-lg border border-white/10 bg-white/4 px-3 py-2">
          <ShinyText text={t("hooksPanel.processing")} speed={2.1} className="text-xs" />
        </div>
      ) : null}

      <div className="mt-3 space-y-2">
        <AnimatePresence mode="popLayout">
          {hooks.map((hook) => {
            const copied = copiedId === hook.id
            return (
              <motion.div
                layout
                key={hook.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="rounded-lg border border-white/10 bg-white/4 p-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 text-sm leading-snug break-words text-zinc-100">{hook.headline}</p>
                  <button
                    onClick={() => copyText(hook.id, hook.headline)}
                    className="rounded-md border border-white/12 bg-black/20 p-1.5 text-zinc-300 transition hover:bg-white/10"
                    title={t("hooksPanel.copyHook")}
                  >
                    {copied ? <CopyCheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
                  </button>
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-400">
                  <span>{toneMap[hook.tone]}</span>
                  <span>{hook.predictedLift}</span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">{hook.reasoning}</p>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </SpotlightCard>
  )
}
