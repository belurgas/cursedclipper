import { motion } from "framer-motion"

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { workspaceMotion } from "@/features/workspace/motion"
import { workspaceModes, type WorkspaceMode } from "@/features/workspace/workspace-modes"

type ModeRailProps = {
  activeMode: WorkspaceMode
  onModeChange: (mode: WorkspaceMode) => void
}

export function ModeRail({ activeMode, onModeChange }: ModeRailProps) {
  return (
    <TooltipProvider>
      <aside className="glass-panel relative z-30 flex h-auto w-full flex-row items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/4 p-2 backdrop-blur-xl lg:h-full lg:w-16 lg:flex-col lg:justify-start lg:py-3">
        {workspaceModes.map((mode) => {
          const Icon = mode.icon
          const isActive = mode.id === activeMode
          return (
            <Tooltip key={mode.id}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onModeChange(mode.id)}
                  className="group/rail relative flex h-10 w-10 items-center justify-center rounded-lg outline-none"
                  aria-label={mode.label}
                >
                  {isActive ? (
                    <motion.div
                      layoutId="workspace-mode-active"
                      className="absolute inset-0 rounded-lg border border-zinc-200/35 bg-zinc-100/12"
                      transition={workspaceMotion.railSpring}
                    />
                  ) : null}
                  <Icon
                    className={[
                      "relative z-10 size-4 transition",
                      isActive ? "text-zinc-100" : "text-zinc-500 group-hover/rail:text-zinc-300",
                    ].join(" ")}
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{mode.label}</TooltipContent>
            </Tooltip>
          )
        })}
      </aside>
    </TooltipProvider>
  )
}
