import type { SubtitleRenderProfile, TranscriptWord } from "@/app/types"

export type SubtitlePreviewWord = {
  text: string
  emphasized: boolean
  active: boolean
}

export type SubtitlePreview = {
  lines: SubtitlePreviewWord[][]
  profile: SubtitleRenderProfile
}

const DEFAULT_PREVIEW_PROFILE: SubtitleRenderProfile = {
  animation: "line",
  position: "bottom",
  fontFamily: "Inter",
  fontSize: 52,
  lineHeight: 1.12,
  maxWordsPerLine: 5,
  maxCharsPerLine: 28,
  maxLines: 2,
  safeMarginX: 86,
  safeMarginY: 118,
  primaryColor: "#FFFFFF",
  secondaryColor: "#7EA6FF",
  outlineColor: "#0A0D16",
  shadowColor: "#000000",
  outlineWidth: 2.2,
  shadowDepth: 1.5,
  bold: true,
  italic: false,
  allCaps: false,
  letterSpacing: 0.1,
  fadeInMs: 100,
  fadeOutMs: 140,
  highlightImportantWords: true,
}

const isBoundary = (value: string) =>
  /[.!?…]$/.test(value.trim())

const normalizeWord = (value: string, allCaps: boolean) => {
  const cleaned = value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[{}]/g, "")
  if (!cleaned) {
    return ""
  }
  return allCaps ? cleaned.toUpperCase() : cleaned
}

const isEmphasisCandidate = (value: string) => {
  const letters = [...value].filter((char) => /\p{L}/u.test(char)).length
  if (letters < 5) {
    return false
  }
  if (letters >= 8) {
    return true
  }
  return /\d/.test(value)
}

function splitIntoLines(
  words: Array<{ text: string; emphasized: boolean; start: number; end: number }>,
  maxWordsPerLine: number,
  maxCharsPerLine: number,
  maxLines: number,
): Array<Array<{ text: string; emphasized: boolean; start: number; end: number }>> {
  const lines: Array<Array<{ text: string; emphasized: boolean; start: number; end: number }>> = []
  let current: Array<{ text: string; emphasized: boolean; start: number; end: number }> = []
  let chars = 0

  for (const word of words) {
    const add = current.length === 0 ? word.text.length : word.text.length + 1
    const needsNewLine =
      current.length >= maxWordsPerLine || chars + add > maxCharsPerLine
    if (needsNewLine && current.length > 0) {
      lines.push(current)
      current = []
      chars = 0
    }

    current.push(word)
    chars += current.length === 1 ? word.text.length : word.text.length + 1
  }

  if (current.length > 0) {
    lines.push(current)
  }

  if (lines.length <= maxLines) {
    return lines
  }

  const compact = lines.slice(0, maxLines)
  const overflow = lines.slice(maxLines).flat()
  if (overflow.length > 0) {
    compact[maxLines - 1] = [...compact[maxLines - 1], ...overflow]
  }
  return compact
}

type SubtitleCue = {
  start: number
  end: number
  lines: Array<Array<{ text: string; emphasized: boolean; start: number; end: number }>>
}

function buildCues(
  words: TranscriptWord[],
  profile: SubtitleRenderProfile,
  layout?: {
    boxWidth?: number
    boxHeight?: number
  },
): SubtitleCue[] {
  const safeBoxWidth = Math.max(0.55, Math.min(1.65, layout?.boxWidth ?? 1))
  const safeBoxHeight = Math.max(0.55, Math.min(1.65, layout?.boxHeight ?? 1))
  const maxWordsPerLine = Math.max(
    2,
    Math.min(14, Math.round((profile.maxWordsPerLine || 5) * safeBoxWidth)),
  )
  const maxCharsPerLine = Math.max(
    12,
    Math.min(64, Math.round((profile.maxCharsPerLine || 28) * safeBoxWidth)),
  )
  const maxLines = Math.max(1, Math.min(6, Math.round((profile.maxLines || 2) * safeBoxHeight)))
  const chunkWordLimit = Math.max(3, Math.min(24, maxWordsPerLine * maxLines))
  const chunkCharLimit = Math.max(18, Math.min(140, maxCharsPerLine * maxLines))

  const tokenized = words
    .map((word) => {
      const text = normalizeWord(word.text, profile.allCaps)
      if (!text) {
        return null
      }
      return {
        text,
        start: word.start,
        end: word.end,
        emphasized: profile.highlightImportantWords && isEmphasisCandidate(text),
      }
    })
    .filter(
      (
        word,
      ): word is { text: string; start: number; end: number; emphasized: boolean } =>
        Boolean(word),
    )

  if (tokenized.length === 0) {
    return []
  }

  const cues: SubtitleCue[] = []
  let current: Array<{ text: string; emphasized: boolean; start: number; end: number }> = []
  let chars = 0

  for (const word of tokenized) {
    const addChars = current.length === 0 ? word.text.length : word.text.length + 1
    const chunkStart = current[0]?.start ?? word.start
    const predictedDuration = word.end - chunkStart
    const chunkHasOverflow =
      current.length >= chunkWordLimit || chars + addChars > chunkCharLimit || predictedDuration > 4.4
    const hasLargeGap =
      current.length > 0
        ? word.start - (current[current.length - 1]?.end ?? word.start) > 0.62
        : false
    const endedSentence =
      current.length > 0 &&
      isBoundary(current[current.length - 1]?.text ?? "") &&
      current.length >= Math.max(2, Math.floor(chunkWordLimit / 2))

    if (current.length > 0 && (chunkHasOverflow || hasLargeGap || endedSentence)) {
      cues.push({
        start: current[0]?.start ?? word.start,
        end: current[current.length - 1]?.end ?? word.end,
        lines: splitIntoLines(current, maxWordsPerLine, maxCharsPerLine, maxLines),
      })
      current = []
      chars = 0
    }

    current.push(word)
    chars += current.length === 1 ? word.text.length : word.text.length + 1
  }

  if (current.length > 0) {
    cues.push({
      start: current[0]?.start ?? 0,
      end: current[current.length - 1]?.end ?? current[0]?.end ?? 0,
      lines: splitIntoLines(current, maxWordsPerLine, maxCharsPerLine, maxLines),
    })
  }

  return cues
}

export function buildSubtitlePreview(
  words: TranscriptWord[],
  currentTime: number,
  profile?: SubtitleRenderProfile | null,
  layout?: {
    boxWidth?: number
    boxHeight?: number
  },
): SubtitlePreview | null {
  if (!Array.isArray(words) || words.length === 0 || !Number.isFinite(currentTime)) {
    return null
  }

  const renderProfile = profile ?? DEFAULT_PREVIEW_PROFILE
  const cues = buildCues(words, renderProfile, layout)
  if (cues.length === 0) {
    return null
  }
  const activeCue =
    cues.find((cue) => currentTime >= cue.start && currentTime <= cue.end + 0.12) ?? null
  if (!activeCue) {
    return null
  }
  const lines: SubtitlePreviewWord[][] = activeCue.lines.map((line) =>
    line.map((word) => ({
      text: word.text,
      emphasized: word.emphasized,
      active: currentTime >= word.start && currentTime <= word.end + 0.05,
    })),
  )

  return {
    lines,
    profile: renderProfile,
  }
}
