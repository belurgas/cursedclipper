import { Dither } from "@/shared/react-bits/dither"

type AmbientBackgroundProps = {
  variant: "dashboard" | "workspace"
}

export function AmbientBackground({ variant }: AmbientBackgroundProps) {
  const isWorkspace = variant === "workspace"
  const ditherClassName = isWorkspace
    ? "absolute inset-0 opacity-[0.04] mix-blend-soft-light"
    : "absolute inset-0 opacity-[0.035] mix-blend-normal"

  return (
    <div className="pointer-events-none absolute inset-0 -z-0 overflow-hidden">
      <Dither
        colorNum={29}
        waveColor={[0.5, 0.5, 0.5]}
        className={ditherClassName}
      />
      <div
        className={
          isWorkspace
            ? "absolute inset-0 bg-[radial-gradient(circle_at_14%_10%,rgba(206,218,236,0.1),transparent_30%),radial-gradient(circle_at_84%_16%,rgba(152,170,196,0.08),transparent_28%),linear-gradient(180deg,rgba(9,12,16,0.16),rgba(7,9,12,0.54))]"
            : "absolute inset-0 bg-[radial-gradient(circle_at_14%_10%,rgba(206,218,236,0.09),transparent_32%),radial-gradient(circle_at_84%_16%,rgba(152,170,196,0.07),transparent_30%),linear-gradient(180deg,rgba(9,12,16,0.14),rgba(7,9,12,0.48))]"
        }
      />

      <div className="absolute -top-[18%] left-[6%] h-[340px] w-[340px] rounded-full bg-[rgba(190,204,226,0.07)] blur-[120px]" />
      <div className="absolute -top-[16%] right-[8%] h-[300px] w-[300px] rounded-full bg-[rgba(150,166,192,0.07)] blur-[110px]" />
    </div>
  )
}
