import type { CSSProperties } from "react"

type DitherProps = {
  colorNum?: number
  waveColor?: [number, number, number]
  className?: string
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export function Dither({
  colorNum = 29,
  waveColor = [0.5, 0.5, 0.5],
  className,
}: DitherProps) {
  const gray = clamp(Math.round(colorNum), 0, 255)
  const waveR = clamp(Math.round(waveColor[0] * 255), 0, 255)
  const waveG = clamp(Math.round(waveColor[1] * 255), 0, 255)
  const waveB = clamp(Math.round(waveColor[2] * 255), 0, 255)

  const style = {
    backgroundImage: `
      radial-gradient(circle, rgba(${gray},${gray},${gray},0.18) 1px, transparent 1px),
      radial-gradient(circle at 20% 14%, rgba(${waveR},${waveG},${waveB},0.05), transparent 56%),
      radial-gradient(circle at 82% 8%, rgba(${waveR},${waveG},${waveB},0.04), transparent 52%)
    `,
    backgroundSize: "6px 6px, 100% 100%, 100% 100%",
    backgroundPosition: "0 0, 0 0, 0 0",
    imageRendering: "auto",
    willChange: "auto",
  } as CSSProperties

  return <div className={className} style={style} />
}
