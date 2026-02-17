import type { NewsItem, Project, TranscriptWord } from "@/app/types"

const script = `
модель уже определила самые сильные хуки в этом интервью и ранжировала их по эмоциональной ясности и потенциалу удержания.
теперь можно убрать паузы выровнять ритм и подготовить версии для reels shorts telegram и вертикальных публикаций.
пока идет анализ зафиксируйте ключевые слова отметьте смысловые повороты и сохраните пики энергии спикера.
каждое слово в этой панели привязано ко времени поэтому клипы можно собирать точно еще до финального рендера.
`
  .trim()
  .replace(/\s+/g, " ")

export const initialProjects: Project[] = [
  {
    id: "p_01",
    name: "История основателя - выпуск 12",
    description: "Нарративная сборка о запуске продукта и первых продажах.",
    updatedAt: "5 мин назад",
    clips: 8,
    durationSeconds: 1520,
    status: "ready",
  },
  {
    id: "p_02",
    name: "Отзывы кампании",
    description: "Реакции аудитории, сгруппированные по основным возражениям.",
    updatedAt: "18 мин назад",
    clips: 5,
    durationSeconds: 940,
    status: "processing",
  },
  {
    id: "p_03",
    name: "Пакет подкаста креатора",
    description: "Недельный набор вертикальных клипов для Shorts и TikTok.",
    updatedAt: "1 ч назад",
    clips: 11,
    durationSeconds: 2840,
    status: "ready",
  },
  {
    id: "p_04",
    name: "Ключевые моменты вебинара",
    description: "Сегменты по фичам с акцентом на CTA и выгоду.",
    updatedAt: "2 ч назад",
    clips: 3,
    durationSeconds: 3210,
    status: "draft",
  },
]

export const newsFeed: NewsItem[] = [
  {
    id: "n_01",
    label: "Рынок",
    title: "Короткие форматы с экспертными монологами показывают рост досмотров.",
    timestamp: "Сегодня",
  },
  {
    id: "n_02",
    label: "Совет",
    title: "Фиксируйте ключевые слова до генерации клипов, чтобы усилить релевантность.",
    timestamp: "Сегодня",
  },
  {
    id: "n_03",
    label: "Инсайт",
    title: "Лучше всего работают клипы длиной 22-38 секунд с четким обещанием в начале.",
    timestamp: "Вчера",
  },
]

export const updatesFeed: NewsItem[] = [
  {
    id: "u_01",
    label: "Релиз",
    title: "Семантический таймлайн теперь учитывает доверие к смысловым блокам.",
    timestamp: "Сегодня",
  },
  {
    id: "u_02",
    label: "Система",
    title: "Генератор обложек получил быстрые шаблоны под TikTok и Shorts.",
    timestamp: "Сегодня",
  },
  {
    id: "u_03",
    label: "Интерфейс",
    title: "Новый режим рабочего пространства сокращает визуальный шум при монтаже.",
    timestamp: "2 дня назад",
  },
]

export const createProjectDraft = (
  name: string,
  description: string,
): Project => ({
  id: `p_${Math.random().toString(36).slice(2, 9)}`,
  name,
  description,
  updatedAt: "только что",
  clips: 0,
  durationSeconds: 0,
  status: "draft",
})

export const formatSeconds = (seconds: number): string => {
  const bounded = Math.max(0, Math.floor(seconds))
  const mins = Math.floor(bounded / 60)
  const secs = bounded % 60
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

export const formatDurationLabel = (seconds: number): string => {
  const bounded = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(bounded / 3600)
  const mins = Math.floor((bounded % 3600) / 60)
  if (hours > 0) {
    return `${hours} ч ${mins} мин`
  }
  return `${mins} мин`
}

export const makeMockTranscript = (duration: number): TranscriptWord[] => {
  const safeDuration = Math.max(duration, 45)
  const tokens = script.split(" ")
  const desiredWordCount = Math.min(3200, Math.max(220, Math.floor(safeDuration * 2.7)))
  const repeatedTokens = Array.from({ length: desiredWordCount }, (_, index) => {
    return tokens[index % tokens.length]
  })
  const baseStep = safeDuration / (repeatedTokens.length + 6)

  return repeatedTokens.map((text, index) => {
    const drift = (index % 4) * 0.02
    const start = index * baseStep + drift
    const end = Math.min(start + baseStep * 0.92, safeDuration)
    return {
      id: `w_${index}`,
      text,
      start,
      end,
    }
  })
}
