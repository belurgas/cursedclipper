import { motion } from "framer-motion"

import type { PlatformPreset } from "@/app/types"
import { SpotlightCard } from "@/shared/react-bits/spotlight-card"

type ExportPresetsPanelProps = {
  presets: PlatformPreset[]
  selectedPresetIds: string[]
  onToggle: (id: string) => void
}

export function ExportPresetsPanel({
  presets,
  selectedPresetIds,
  onToggle,
}: ExportPresetsPanelProps) {
  return (
    <SpotlightCard className="rounded-xl border border-white/12 bg-black/28 p-3">
      <p className="text-xs tracking-[0.15em] text-zinc-500 uppercase">Платформы экспорта</p>
      <p className="mt-1 text-xs text-zinc-400">
        Экспорт в несколько платформ с готовыми ограничениями длительности и формата.
      </p>

      <div className="mt-3 grid grid-cols-1 gap-2">
        {presets.map((preset) => {
          const selected = selectedPresetIds.includes(preset.id)
          return (
            <motion.button
              key={preset.id}
              whileHover={{ y: -1 }}
              onClick={() => onToggle(preset.id)}
              className={[
                "rounded-lg border p-2.5 text-left transition",
                selected
                  ? "border-zinc-200/40 bg-zinc-100/12"
                  : "border-white/10 bg-white/4 hover:border-white/20",
              ].join(" ")}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-zinc-100">{preset.name}</p>
                <span className="text-[11px] text-zinc-400">{preset.aspect}</span>
              </div>
              <p className="mt-1 text-xs text-zinc-500">Макс. {preset.maxDuration}</p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-400">{preset.description}</p>
            </motion.button>
          )
        })}
      </div>
    </SpotlightCard>
  )
}
