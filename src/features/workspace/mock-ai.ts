import type {
  ContentPlanIdea,
  HookCandidate,
  PlatformPreset,
  SemanticBlock,
  SemanticBlockType,
  SeriesSegment,
  SubtitlePreset,
  ThumbnailTemplate,
  TranscriptSemanticBlock,
  TranscriptWord,
  ViralInsight,
} from "@/app/types"

const semanticPalette: Record<
  SemanticBlockType,
  { bg: string; border: string; glow: string }
> = {
  hook: { bg: "rgba(181, 196, 220, 0.18)", border: "rgba(204, 217, 240, 0.5)", glow: "#d7deed" },
  story: { bg: "rgba(136, 156, 187, 0.18)", border: "rgba(150, 172, 206, 0.48)", glow: "#b3c3e2" },
  proof: { bg: "rgba(124, 134, 153, 0.2)", border: "rgba(153, 167, 194, 0.42)", glow: "#a8b4cc" },
  cta: { bg: "rgba(188, 198, 216, 0.2)", border: "rgba(220, 228, 242, 0.5)", glow: "#dae3f3" },
}

const semanticMeta: Record<SemanticBlockType, { label: string; summary: string; theme: string }> =
  {
    hook: {
      label: "Хук",
      summary: "Сильный вход с обещанием результата и триггером внимания.",
      theme: "Запуск внимания",
    },
    story: {
      label: "Контекст",
      summary: "Смысловой слой, который удерживает и объясняет причину.",
      theme: "Нарратив и контекст",
    },
    proof: {
      label: "Доказательство",
      summary: "Факт, пример или метрика, укрепляющие доверие.",
      theme: "Подтверждение ценности",
    },
    cta: {
      label: "Действие",
      summary: "Ясный призыв и следующий шаг для зрителя.",
      theme: "Призыв к действию",
    },
  }

const blockTypeCycle: SemanticBlockType[] = ["hook", "story", "proof", "cta"]

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const isSentenceBoundary = (value: string) => /[.!?]$/.test(value)

export const subtitlePresets: SubtitlePreset[] = [
  {
    id: "sub_cinematic",
    name: "Кинематографичный минимал",
    description: "Мягкая тень, высокий контраст, плавная подача фраз.",
    styleSample: "Именно здесь идея становится понятной.",
  },
  {
    id: "sub_punch",
    name: "Акцентные слова",
    description: "Ключевые слова деликатно усиливаются в ритме речи.",
    styleSample: "Достаточно одного сильного хука.",
  },
  {
    id: "sub_editorial",
    name: "Редакционный стиль",
    description: "Премиальная типографика для экспертного повествования.",
    styleSample: "Аудитория запоминает эмоциональную ясность.",
  },
  {
    id: "sub_clean",
    name: "Чистый универсальный",
    description: "Компактная подача для плотного информационного контента.",
    styleSample: "Преобразуйте инсайт в конкретное действие.",
  },
]

export const platformPresets: PlatformPreset[] = [
  {
    id: "pf_tiktok",
    name: "TikTok",
    aspect: "9:16",
    maxDuration: "60 с",
    description: "Быстрый хук, безопасные поля под субтитры, динамичный темп.",
  },
  {
    id: "pf_shorts",
    name: "Shorts",
    aspect: "9:16",
    maxDuration: "60 с",
    description: "Ритм под удержание и прямой CTA в финале.",
  },
  {
    id: "pf_reels",
    name: "Reels",
    aspect: "9:16",
    maxDuration: "90 с",
    description: "Историйная подача и чистые нижние подписи.",
  },
  {
    id: "pf_telegram",
    name: "Telegram",
    aspect: "16:9",
    maxDuration: "120 с",
    description: "Более контекстный формат для канала и объясняющих нарезок.",
  },
]

export const getSemanticStyle = (type: SemanticBlockType) => semanticPalette[type]

export const buildSemanticBlocks = (duration: number): SemanticBlock[] => {
  const safeDuration = Math.max(duration, 60)
  const blockCount = clamp(Math.round(safeDuration / 36), 4, 9)
  const blockSize = safeDuration / blockCount

  return Array.from({ length: blockCount }, (_, index) => {
    const type = blockTypeCycle[index % blockTypeCycle.length]
    const start = index * blockSize
    const end = Math.min(start + blockSize, safeDuration)
    const confidence = clamp(Math.round(89 - ((index % 4) * 4 + index * 0.8)), 72, 92)

    return {
      id: `sb_${index}`,
      label: `${semanticMeta[type].label} ${index + 1}`,
      start,
      end,
      type,
      confidence,
      summary: semanticMeta[type].summary,
    }
  })
}

export const buildTranscriptSemanticBlocks = (
  words: TranscriptWord[],
): TranscriptSemanticBlock[] => {
  if (words.length === 0) {
    return []
  }

  const blocks: TranscriptSemanticBlock[] = []
  let wordStart = 0

  for (let index = 0; index < words.length; index += 1) {
    const size = index - wordStart + 1
    const naturalBoundary = isSentenceBoundary(words[index].text) && size >= 8
    const hardBoundary = size >= 22
    const isLast = index === words.length - 1

    if (!naturalBoundary && !hardBoundary && !isLast) {
      continue
    }

    const type = blockTypeCycle[blocks.length % blockTypeCycle.length]
    const confidence = clamp(Math.round(91 - (blocks.length % 5) * 3), 73, 94)
    const block: TranscriptSemanticBlock = {
      id: `tsb_${blocks.length}`,
      label: `${semanticMeta[type].label} ${blocks.length + 1}`,
      start: words[wordStart]?.start ?? 0,
      end: words[index]?.end ?? words[wordStart]?.end ?? 0,
      type,
      confidence,
      summary: semanticMeta[type].summary,
      wordStart,
      wordEnd: index,
    }
    blocks.push(block)
    wordStart = index + 1
  }

  if (blocks.length < 2) {
    return blocks
  }

  const merged: TranscriptSemanticBlock[] = []
  for (const block of blocks) {
    const previous = merged[merged.length - 1]
    const blockDuration = block.end - block.start
    const canMergeWithPrevious = previous && blockDuration < 1.2
    if (!canMergeWithPrevious) {
      merged.push(block)
      continue
    }

    previous.end = block.end
    previous.wordEnd = block.wordEnd
    previous.confidence = Math.round((previous.confidence + block.confidence) / 2)
  }

  return merged.map((block, index) => ({
    ...block,
    id: `tsb_${index}`,
    label: `${semanticMeta[block.type].label} ${index + 1}`,
  }))
}

export const computeViralScore = (words: TranscriptWord[]): number => {
  if (words.length === 0) {
    return 0
  }

  const density = Math.min(1, words.length / 120)
  const punctuationBoost = words.filter((word) => /[.!?]$/.test(word.text)).length / words.length
  const energeticWords = words.filter((word) =>
    /(сильн|один|ясн|пик|луч|быстр|хук|результат|вниман|удерж)/i.test(word.text),
  ).length
  const energeticBoost = Math.min(1, energeticWords / 22)

  return Math.round(58 + density * 18 + punctuationBoost * 11 + energeticBoost * 13)
}

export const buildViralInsights = (score: number): ViralInsight[] => [
  {
    id: "vi_hook_density",
    title: "Плотность хуков выше медианы ниши",
    impact: "High",
    detail: `Профиль первых секунд попадает в верхние ${Math.max(
      8,
      100 - score,
    )}% по вероятности удержания.`,
  },
  {
    id: "vi_pacing",
    title: "Ритм фраз поддерживает повторные просмотры",
    impact: "Medium",
    detail: "Переходы между предложениями компактные, риск потери внимания после 7-й секунды низкий.",
  },
  {
    id: "vi_clarity",
    title: "Формулировку выгоды стоит усилить в финале",
    impact: "Medium",
    detail: "Добавьте явный результат в последние 20% клипа для роста намерения досмотреть до конца.",
  },
]

export const buildHookCandidates = (
  projectName: string,
  sourceWords: TranscriptWord[],
): HookCandidate[] => {
  const seedPhrase = sourceWords.slice(0, 12).map((word) => word.text).join(" ")
  const compactSeed = seedPhrase.slice(0, 64).trim()

  return [
    {
      id: "hk_1",
      headline: "Одна правка изменила то, как досматривают это видео",
      reasoning: "Формулировка трансформации усиливает удержание в первые 3 секунды.",
      predictedLift: "+18% удержание",
      tone: "Bold",
    },
    {
      id: "hk_2",
      headline: "Прежде чем публиковать клип, проверьте эту ошибку тайминга",
      reasoning: "Рамка риска + прикладная польза повышают вероятность открытия.",
      predictedLift: "+12% открытие",
      tone: "Direct",
    },
    {
      id: "hk_3",
      headline: `Из "${projectName}" в 30-секундную историю с высокой конверсией`,
      reasoning: "Упоминание источника повышает релевантность и доверие.",
      predictedLift: "+16% досмотр",
      tone: "Data-led",
    },
    {
      id: "hk_4",
      headline: `Самый пересматриваемый момент начинается здесь: ${compactSeed}...`,
      reasoning: "Незавершенный контекст создает эффект ожидания и усиливает интерес.",
      predictedLift: "+14% повтор",
      tone: "Reflective",
    },
  ]
}

export const buildContentPlanIdeas = (
  projectName: string,
  hooks: HookCandidate[],
): ContentPlanIdea[] => [
  {
    id: "cp_1",
    title: "Мини-серия «Миф / Реальность»",
    angle: "Каждый эпизод закрывает одно возражение аудитории через доказательство.",
    channels: ["Reels", "Shorts", "TikTok"],
    scriptOutline:
      "Миф -> 2 секунды опровержения -> фрагмент доказательства -> один практический вывод.",
  },
  {
    id: "cp_2",
    title: "Микро-уроки основателя",
    angle: `Преобразовать "${projectName}" в пять стратегических микро-историй.`,
    channels: ["Shorts", "Telegram"],
    scriptOutline:
      "Ситуация -> решение -> результат -> короткая рефлексия, усиливающая экспертность.",
  },
  {
    id: "cp_3",
    title: `Лестница хуков от "${hooks[0]?.headline ?? "основной идеи"}"`,
    angle: "Публикация трех версий одного смыслового блока с разным входом.",
    channels: ["TikTok", "Reels"],
    scriptOutline:
      "Версия A (любопытство) -> Версия B (проблема) -> Версия C (доказательство в начале).",
  },
]

export const buildSeriesSegments = (
  blocks: SemanticBlock[],
  duration: number,
): SeriesSegment[] => {
  const safeDuration = Math.max(duration, 60)
  const segments = blocks.slice(0, 4)
  if (segments.length === 0) {
    return []
  }

  return segments.map((block, index) => {
    const paddedStart = Math.max(0, block.start - 0.8)
    const paddedEnd = Math.min(safeDuration, block.end + 0.8)
    return {
      id: `seg_${index}`,
      title: `Эпизод ${index + 1}`,
      start: paddedStart,
      end: paddedEnd,
      theme: semanticMeta[block.type].theme,
      rationale: block.summary,
    }
  })
}

export const buildThumbnailTemplates = (
  projectName: string,
  duration: number,
): ThumbnailTemplate[] => [
  {
    id: "th_1",
    name: "Серебряный фокус",
    overlayTitle: "Этот момент меняет все",
    overlaySubtitle: projectName,
    focusTime: Math.max(2, duration * 0.16),
    palette: ["#dfe6f3", "#78839a"],
  },
  {
    id: "th_2",
    name: "Редакционный контраст",
    overlayTitle: "Инсайт за 10 секунд",
    overlaySubtitle: "Стратегия удержания",
    focusTime: Math.max(4, duration * 0.3),
    palette: ["#edf2fb", "#5f6c86"],
  },
  {
    id: "th_3",
    name: "Уверенный кадр",
    overlayTitle: "Сделайте это до публикации",
    overlaySubtitle: "Интеллект Cursed Clipper",
    focusTime: Math.max(5, duration * 0.45),
    palette: ["#f4f7ff", "#6f7d96"],
  },
]
