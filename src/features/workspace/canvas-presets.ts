import type {
  ClipCanvasAspect,
  ClipCanvasResolution,
} from "@/app/types"

export type ClipCanvasResolutionPreset = {
  id: ClipCanvasResolution
  label: string
  width: number
  height: number
  aspect: ClipCanvasAspect
}

const toResolutionId = (width: number, height: number): ClipCanvasResolution =>
  `${width}x${height}` as ClipCanvasResolution

const aspectRatioByAspect: Record<ClipCanvasAspect, number> = {
  "9:16": 9 / 16,
  "16:9": 16 / 9,
  "1:1": 1,
}

const resolutionPresets: ClipCanvasResolutionPreset[] = [
  { id: toResolutionId(720, 1280), label: "720 x 1280 (HD)", width: 720, height: 1280, aspect: "9:16" },
  { id: toResolutionId(1080, 1920), label: "1080 x 1920 (Full HD)", width: 1080, height: 1920, aspect: "9:16" },
  { id: toResolutionId(1440, 2560), label: "1440 x 2560 (2K)", width: 1440, height: 2560, aspect: "9:16" },
  { id: toResolutionId(1280, 720), label: "1280 x 720 (HD)", width: 1280, height: 720, aspect: "16:9" },
  { id: toResolutionId(1920, 1080), label: "1920 x 1080 (Full HD)", width: 1920, height: 1080, aspect: "16:9" },
  { id: toResolutionId(2560, 1440), label: "2560 x 1440 (2K)", width: 2560, height: 1440, aspect: "16:9" },
  { id: toResolutionId(3840, 2160), label: "3840 x 2160 (4K)", width: 3840, height: 2160, aspect: "16:9" },
  { id: toResolutionId(720, 720), label: "720 x 720", width: 720, height: 720, aspect: "1:1" },
  { id: toResolutionId(1080, 1080), label: "1080 x 1080", width: 1080, height: 1080, aspect: "1:1" },
  { id: toResolutionId(1440, 1440), label: "1440 x 1440", width: 1440, height: 1440, aspect: "1:1" },
  { id: toResolutionId(2160, 2160), label: "2160 x 2160", width: 2160, height: 2160, aspect: "1:1" },
]

export const defaultResolutionByAspect: Record<ClipCanvasAspect, ClipCanvasResolution> = {
  "9:16": toResolutionId(1080, 1920),
  "16:9": toResolutionId(1920, 1080),
  "1:1": toResolutionId(1080, 1080),
}

export const clipCanvasResolutionPresetsByAspect: Record<
  ClipCanvasAspect,
  ClipCanvasResolutionPreset[]
> = {
  "9:16": resolutionPresets.filter((item) => item.aspect === "9:16"),
  "16:9": resolutionPresets.filter((item) => item.aspect === "16:9"),
  "1:1": resolutionPresets.filter((item) => item.aspect === "1:1"),
}

export function parseClipCanvasResolution(
  value: string | null | undefined,
): { width: number; height: number } | null {
  if (typeof value !== "string") {
    return null
  }
  const match = value.trim().match(/^(\d{3,5})x(\d{3,5})$/i)
  if (!match) {
    return null
  }
  const width = Number(match[1])
  const height = Number(match[2])
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return null
  }
  if (width < 240 || height < 240 || width > 4320 || height > 4320) {
    return null
  }
  return { width, height }
}

export function normalizeClipCanvasResolution(
  aspect: ClipCanvasAspect,
  value: string | null | undefined,
): ClipCanvasResolution {
  const parsed = parseClipCanvasResolution(value)
  if (!parsed) {
    return defaultResolutionByAspect[aspect]
  }
  const targetRatio = aspectRatioByAspect[aspect]
  const actualRatio = parsed.width / parsed.height
  if (Math.abs(actualRatio - targetRatio) > 0.03) {
    return defaultResolutionByAspect[aspect]
  }
  return toResolutionId(parsed.width, parsed.height)
}
