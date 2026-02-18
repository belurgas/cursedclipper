import { useMemo, useState } from "react"
import { motion } from "framer-motion"
import {
  BellIcon,
  BookOpenTextIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Clock3Icon,
  UserCircle2Icon,
} from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

import type { NewsItem } from "@/app/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

type FeedViewProps = {
  kind: "news" | "updates"
  title: string
  description: string
  items: NewsItem[]
}

const feedStyleMap = {
  news: {
    badge: "border-sky-200/30 bg-sky-400/12 text-sky-100",
    rowAccent: "from-sky-300/35 via-emerald-300/18 to-transparent",
    previewFrame: "border-sky-300/18 bg-[radial-gradient(circle_at_90%_10%,rgba(56,189,248,0.18),transparent_48%),rgba(0,0,0,0.24)]",
    defaultEmoji: "📰",
    defaultAuthor: "Редакция Cursed Clipper",
  },
  updates: {
    badge: "border-amber-200/30 bg-amber-300/12 text-amber-100",
    rowAccent: "from-amber-300/35 via-blue-300/18 to-transparent",
    previewFrame: "border-amber-300/18 bg-[radial-gradient(circle_at_90%_10%,rgba(245,158,11,0.16),transparent_48%),rgba(0,0,0,0.24)]",
    defaultEmoji: "🚀",
    defaultAuthor: "Product Team",
  },
} as const

function buildFallbackArticleMarkdown(item: NewsItem, kind: FeedViewProps["kind"]) {
  const emoji = kind === "news" ? "🧠" : "⚙️"
  const topic = kind === "news" ? "рынка контента" : "продукта Cursed Clipper"
  return `
# ${emoji} ${item.title}

Эта запись получена из ленты **${topic}**.

## Коротко

- Категория: ${item.label}
- Время публикации: ${item.timestamp}
- Контекст: рабочие сценарии монтажа и аналитики

## Почему это важно

Материал влияет на решения по структуре клипов, ритму монтажа и приоритетам в публикации.

## Что проверить в проекте

- [ ] Достаточно ли сильный хук в первые секунды
- [ ] Нет ли лишних фраз без смысловой нагрузки
- [ ] Соответствует ли длительность целевой платформе
`.trim()
}

export function FeedView({ kind, title, description, items }: FeedViewProps) {
  const style = feedStyleMap[kind]
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [previewIndex, setPreviewIndex] = useState(0)

  const enrichedItems = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        coverEmoji: item.coverEmoji ?? style.defaultEmoji,
        author: item.author ?? style.defaultAuthor,
        summary: item.summary ?? item.title,
        contentMarkdown: item.contentMarkdown ?? buildFallbackArticleMarkdown(item, kind),
      })),
    [items, kind, style.defaultAuthor, style.defaultEmoji],
  )

  const boundedActiveIndex =
    enrichedItems.length === 0 ? 0 : Math.min(activeIndex, enrichedItems.length - 1)
  const boundedPreviewIndex =
    enrichedItems.length === 0 ? 0 : Math.min(previewIndex, enrichedItems.length - 1)
  const activeItem = enrichedItems[boundedActiveIndex] ?? null
  const previewItem = enrichedItems[boundedPreviewIndex] ?? enrichedItems[0] ?? null
  const canGoPrev = boundedActiveIndex > 0
  const canGoNext = boundedActiveIndex < enrichedItems.length - 1

  return (
    <>
      <div className="sr-only">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>

      {enrichedItems.length > 0 ? (
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="overflow-hidden rounded-xl border border-white/10 bg-black/18">
            {enrichedItems.map((item, index) => (
              <motion.button
                key={item.id}
                type="button"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: Math.min(index, 8) * 0.03 }}
                onMouseEnter={() => setPreviewIndex(index)}
                onFocus={() => setPreviewIndex(index)}
                onClick={() => {
                  setActiveIndex(index)
                  setOpen(true)
                }}
                className={[
                  "group relative grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-white/8 px-3 py-3 text-left transition last:border-b-0",
                  boundedPreviewIndex === index ? "bg-white/8" : "hover:bg-white/5",
                ].join(" ")}
              >
                <div className={["pointer-events-none absolute inset-y-0 left-0 w-1 bg-gradient-to-b", style.rowAccent].join(" ")} />
                <div className="min-w-0 pl-2">
                  <p className="truncate text-sm font-medium text-zinc-100">
                    {item.title}
                  </p>
                </div>
                <span className="shrink-0 pr-1 text-[11px] text-zinc-500">{item.timestamp}</span>
              </motion.button>
            ))}
          </div>

          {previewItem ? (
            <aside className={["relative overflow-hidden rounded-xl border p-4", style.previewFrame].join(" ")}>
              <div className="relative z-10 flex h-full min-h-[260px] flex-col">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline" className={style.badge}>
                    {previewItem.label}
                  </Badge>
                  <span className="text-[11px] text-zinc-500">
                    {boundedPreviewIndex + 1}/{enrichedItems.length}
                  </span>
                </div>

                <div className="mt-3">
                  <p className="text-3xl leading-none">{previewItem.coverEmoji}</p>
                  <h4 className="mt-2 text-base font-semibold leading-snug text-zinc-100">
                    {previewItem.title}
                  </h4>
                  <p className="mt-2 line-clamp-7 text-xs leading-relaxed text-zinc-300/90">
                    {previewItem.summary}
                  </p>
                </div>

                <div className="mt-3 space-y-1.5 text-[11px] text-zinc-500">
                  <p className="inline-flex items-center gap-1">
                    <Clock3Icon className="size-3.5" />
                    {previewItem.timestamp}
                  </p>
                  <p className="inline-flex items-center gap-1">
                    <UserCircle2Icon className="size-3.5" />
                    {previewItem.author}
                  </p>
                </div>

                <div className="mt-auto pt-4">
                  <Button
                    size="sm"
                    className="w-full bg-zinc-100 text-zinc-950 hover:bg-zinc-100/90"
                    onClick={() => {
                      setActiveIndex(boundedPreviewIndex)
                      setOpen(true)
                    }}
                  >
                    <BookOpenTextIcon className="size-3.5" />
                    Открыть статью
                  </Button>
                </div>
              </div>
            </aside>
          ) : null}
        </section>
      ) : (
        <div className="rounded-xl border border-white/12 bg-black/22 p-8 text-center">
          <BellIcon className="mx-auto mb-2 size-4 text-zinc-400" />
          <p className="text-sm text-zinc-300">Пока нет записей.</p>
          <p className="mt-1 text-xs text-zinc-500">Новые события появятся в этой ленте автоматически.</p>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[88vh] w-[min(960px,calc(100vw-1.25rem))] max-w-5xl overflow-hidden border-white/12 bg-[#080a0f]/94 p-0 backdrop-blur-2xl">
          {activeItem ? (
            <div className="flex h-[min(84vh,860px)] min-h-0 flex-col">
              <DialogHeader className="border-b border-white/10 px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3 pr-8">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={["border-white/20 bg-white/8", style.badge].join(" ")}>
                        {activeItem.label}
                      </Badge>
                      <span className="inline-flex items-center gap-1 text-xs text-zinc-400">
                        <Clock3Icon className="size-3.5" />
                        {activeItem.timestamp}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs text-zinc-400">
                        <UserCircle2Icon className="size-3.5" />
                        {activeItem.author}
                      </span>
                    </div>
                    <DialogTitle className="flex items-start gap-2 text-left text-xl leading-tight text-zinc-100">
                      <span className="pt-0.5 text-2xl">{activeItem.coverEmoji}</span>
                      <span className="break-words">{activeItem.title}</span>
                    </DialogTitle>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="mr-2 text-[11px] text-zinc-500">
                      {boundedActiveIndex + 1}/{enrichedItems.length}
                    </span>
                    <Button
                      size="icon-xs"
                      variant="outline"
                      className="border-white/15 bg-white/6 text-zinc-200 hover:bg-white/10"
                      onClick={() => canGoPrev && setActiveIndex((value) => Math.max(0, value - 1))}
                      disabled={!canGoPrev}
                    >
                      <ChevronLeftIcon className="size-3.5" />
                    </Button>
                    <Button
                      size="icon-xs"
                      variant="outline"
                      className="border-white/15 bg-white/6 text-zinc-200 hover:bg-white/10"
                      onClick={() =>
                        canGoNext &&
                        setActiveIndex((value) => Math.min(enrichedItems.length - 1, value + 1))
                      }
                      disabled={!canGoNext}
                    >
                      <ChevronRightIcon className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </DialogHeader>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-4 sm:px-6">
                <div className="mb-4 inline-flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/5 px-2.5 py-1 text-[11px] text-zinc-300">
                  <BookOpenTextIcon className="size-3.5" />
                  Режим чтения
                </div>

                <div className="space-y-4 text-sm leading-relaxed text-zinc-200">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h1: ({ children }) => <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">{children}</h1>,
                      h2: ({ children }) => <h2 className="mt-6 text-xl font-semibold text-zinc-100">{children}</h2>,
                      h3: ({ children }) => <h3 className="mt-5 text-lg font-semibold text-zinc-100">{children}</h3>,
                      p: ({ children }) => <p className="text-[15px] leading-7 text-zinc-200">{children}</p>,
                      ul: ({ children }) => <ul className="list-disc space-y-1 pl-5 text-zinc-200 marker:text-zinc-400">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5 text-zinc-200 marker:text-zinc-400">{children}</ol>,
                      li: ({ children }) => <li className="pl-0.5">{children}</li>,
                      blockquote: ({ children }) => (
                        <blockquote className="rounded-r-lg border-l-2 border-white/25 bg-white/4 px-3 py-2 text-zinc-300">
                          {children}
                        </blockquote>
                      ),
                      a: ({ href, children }) => (
                        <a href={href} target="_blank" rel="noreferrer" className="text-sky-300 underline decoration-sky-300/55 underline-offset-2 hover:text-sky-200">
                          {children}
                        </a>
                      ),
                      hr: () => <hr className="my-5 border-white/12" />,
                      code: ({ className, children }) => {
                        const text = String(children).replace(/\n$/, "")
                        const isBlock = Boolean(className)
                        if (!isBlock) {
                          return (
                            <code className="rounded bg-white/10 px-1.5 py-0.5 text-[13px] text-zinc-100">
                              {text}
                            </code>
                          )
                        }
                        return (
                          <pre className="overflow-x-auto rounded-xl border border-white/12 bg-black/35 p-3 text-[13px] text-zinc-200">
                            <code className={className}>{text}</code>
                          </pre>
                        )
                      },
                    }}
                  >
                    {activeItem.contentMarkdown ?? ""}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
