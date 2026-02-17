import { type ReactNode, useRef } from "react"
import { cn } from "@/lib/utils"

type SpotlightCardProps = {
  children: ReactNode
  className?: string
  spotlightColor?: string
}

export function SpotlightCard({
  children,
  className,
  spotlightColor = "rgba(232, 238, 248, 0.22)",
}: SpotlightCardProps) {
  const ref = useRef<HTMLDivElement | null>(null)

  return (
    <div
      ref={ref}
      onMouseMove={(event) => {
        const target = ref.current
        if (!target) {
          return
        }
        const rect = target.getBoundingClientRect()
        const x = event.clientX - rect.left
        const y = event.clientY - rect.top
        target.style.setProperty("--mouse-x", `${x}px`)
        target.style.setProperty("--mouse-y", `${y}px`)
        target.style.setProperty("--spotlight-color", spotlightColor)
      }}
      className={cn(
        "relative isolate overflow-hidden [--mouse-x:50%] [--mouse-y:50%] [--spotlight-color:rgba(232,238,248,0.2)]",
        "before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:opacity-0",
        "before:bg-[radial-gradient(circle_at_var(--mouse-x)_var(--mouse-y),var(--spotlight-color),transparent_68%)]",
        "before:transition-opacity before:duration-200 hover:before:opacity-70 focus-within:before:opacity-70",
        className,
      )}
    >
      {children}
    </div>
  )
}
