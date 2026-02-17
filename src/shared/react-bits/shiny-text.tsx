import type { CSSProperties } from "react"

type ShinyTextProps = {
  text: string
  disabled?: boolean
  speed?: number
  className?: string
}

export function ShinyText({
  text,
  disabled = false,
  speed = 5,
  className,
}: ShinyTextProps) {
  const style = {
    animationDuration: `${speed}s`,
  } as CSSProperties

  return (
    <>
      <style>{`
        .rb-shiny-text {
          color: rgba(212, 218, 225, 0.72);
          background: linear-gradient(
            120deg,
            rgba(255, 255, 255, 0) 38%,
            rgba(255, 255, 255, 0.95) 50%,
            rgba(255, 255, 255, 0) 62%
          );
          background-size: 200% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          display: inline-block;
          animation: rb-shine 5s linear infinite;
        }

        @keyframes rb-shine {
          0% {
            background-position: 100%;
          }
          100% {
            background-position: -100%;
          }
        }

        .rb-shiny-text.disabled {
          animation: none;
        }
      `}</style>
      <span
        className={`rb-shiny-text ${disabled ? "disabled" : ""} ${className ?? ""}`}
        style={style}
      >
        {text}
      </span>
    </>
  )
}
