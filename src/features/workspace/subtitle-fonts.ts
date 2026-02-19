const BASE_SUBTITLE_FONT_OPTIONS = [
  "Manrope",
  "Montserrat",
  "Inter",
  "Poppins",
  "Nunito",
  "SF Pro Display",
  "Segoe UI",
  "Helvetica Neue",
  "Arial",
  "Trebuchet MS",
  "Tahoma",
  "Roboto",
  "Open Sans",
  "Lato",
  "Georgia",
  "Times New Roman",
  "Courier New",
  "Verdana",
]

const FONT_CSS_STACK_BY_LABEL: Record<string, string> = {
  Manrope: "\"Manrope Variable\", \"Manrope\", \"Segoe UI\", sans-serif",
  Inter: "\"Inter Variable\", \"Inter\", \"Segoe UI\", sans-serif",
  Montserrat: "\"Montserrat\", \"Inter Variable\", \"Segoe UI\", sans-serif",
  Poppins: "\"Poppins\", \"Inter Variable\", \"Segoe UI\", sans-serif",
  Nunito: "\"Nunito\", \"Inter Variable\", \"Segoe UI\", sans-serif",
  "SF Pro Display": "\"SF Pro Display\", \"Segoe UI\", \"Inter Variable\", sans-serif",
  "Segoe UI": "\"Segoe UI\", \"Inter Variable\", sans-serif",
  "Helvetica Neue": "\"Helvetica Neue\", Helvetica, Arial, sans-serif",
  Arial: "Arial, \"Helvetica Neue\", sans-serif",
  "Trebuchet MS": "\"Trebuchet MS\", \"Segoe UI\", sans-serif",
  Tahoma: "Tahoma, \"Segoe UI\", sans-serif",
  Roboto: "\"Roboto\", \"Inter Variable\", \"Segoe UI\", sans-serif",
  "Open Sans": "\"Open Sans\", \"Inter Variable\", \"Segoe UI\", sans-serif",
  Lato: "\"Lato\", \"Inter Variable\", \"Segoe UI\", sans-serif",
  Georgia: "Georgia, \"Times New Roman\", serif",
  "Times New Roman": "\"Times New Roman\", Times, serif",
  "Courier New": "\"Courier New\", Consolas, monospace",
  Verdana: "Verdana, \"Segoe UI\", sans-serif",
}

const normalizeFontLabel = (value: string) => value.trim().replace(/\s+/g, " ")

export const subtitleFontOptions = BASE_SUBTITLE_FONT_OPTIONS

export function canonicalizeSubtitleFontLabel(value?: string | null): string | null {
  if (typeof value !== "string") {
    return null
  }
  const normalized = normalizeFontLabel(value)
  if (!normalized) {
    return null
  }
  const matchedBaseOption = BASE_SUBTITLE_FONT_OPTIONS.find(
    (candidate) => candidate.toLowerCase() === normalized.toLowerCase(),
  )
  return matchedBaseOption ?? normalized
}

export function buildSubtitleFontOptions(activeFont?: string | null): string[] {
  const active = canonicalizeSubtitleFontLabel(activeFont)
  if (!active) {
    return [...BASE_SUBTITLE_FONT_OPTIONS]
  }
  const list = [...BASE_SUBTITLE_FONT_OPTIONS]
  const exists = list.some((candidate) => candidate.toLowerCase() === active.toLowerCase())
  if (!exists) {
    list.push(active)
  }
  return list
}

export function resolveSubtitleFontCssFamily(value?: string | null): string {
  const resolved = canonicalizeSubtitleFontLabel(value) ?? "Manrope"
  const mapped = FONT_CSS_STACK_BY_LABEL[resolved]
  if (mapped) {
    return mapped
  }
  const escaped = resolved.replace(/"/g, "")
  return `"${escaped}", "Inter Variable", "Segoe UI", sans-serif`
}
