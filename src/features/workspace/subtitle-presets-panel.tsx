import { motion } from "framer-motion"

import type { SubtitlePreset } from "@/app/types"
import { SpotlightCard } from "@/shared/react-bits/spotlight-card"

type SubtitlePresetsPanelProps = {
  presets: SubtitlePreset[]
  activePresetId: string
  onSelect: (id: string) => void
}

export function SubtitlePresetsPanel({
  presets,
  activePresetId,
  onSelect,
}: SubtitlePresetsPanelProps) {
  return (
    <SpotlightCard className="rounded-xl border border-white/12 bg-black/28 p-3">
      <p className="text-xs tracking-[0.15em] text-zinc-500 uppercase">Пресеты субтитров</p>
      <p className="mt-1 text-xs text-zinc-400">
        Типографические стили под разные платформы и сценарии читаемости.
      </p>

      <div className="mt-3 grid grid-cols-1 gap-2">
        {presets.map((preset) => {
          const selected = preset.id === activePresetId
          return (
            <motion.button
              key={preset.id}
              whileHover={{ y: -1 }}
              onClick={() => onSelect(preset.id)}
              className={[
                "rounded-lg border p-2.5 text-left transition",
                selected
                  ? "border-zinc-200/40 bg-zinc-100/12"
                  : "border-white/10 bg-white/4 hover:border-white/20",
              ].join(" ")}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-zinc-100">{preset.name}</p>
                {selected ? <span className="text-[11px] text-zinc-300">Активен</span> : null}
              </div>
              <p className="mt-1 text-xs text-zinc-400">{preset.description}</p>
              <p className="mt-2 text-sm text-zinc-200">{preset.styleSample}</p>
            </motion.button>
          )
        })}
      </div>
    </SpotlightCard>
  )
}
