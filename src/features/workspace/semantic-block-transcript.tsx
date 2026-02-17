import { memo, useMemo, useRef } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"

import { formatSeconds } from "@/app/mock-data"
import type { TranscriptSemanticBlock, TranscriptWord, WordRange } from "@/app/types"
import { getSemanticStyle } from "@/features/workspace/mock-ai"
import { ShinyText } from "@/shared/react-bits/shiny-text"

type SemanticBlockTranscriptProps = {
  blocks: TranscriptSemanticBlock[]
  words: TranscriptWord[]
  visibleWordCount: number
  activeWordIndex: number
  activeBlockId: string | null
  selection: WordRange | null
  isTranscribing: boolean
  onWordSelect: (index: number, extendSelection?: boolean) => void
  onBlockSelect: (startIndex: number, endIndex: number) => void
}

type SemanticBlockRowProps = {
  block: TranscriptSemanticBlock
  words: TranscriptWord[]
  visibleWordCount: number
  activeWordIndex: number
  active: boolean
  selection: WordRange | null
  isTranscribing: boolean
  onWordSelect: (index: number, extendSelection?: boolean) => void
  onBlockSelect: (startIndex: number, endIndex: number) => void
}

const isSelected = (index: number, range: WordRange | null) =>
  !!range && index >= range.start && index <= range.end

const SemanticBlockRow = memo(function SemanticBlockRow({
  block,
  words,
  visibleWordCount,
  activeWordIndex,
  active,
  selection,
  isTranscribing,
  onWordSelect,
  onBlockSelect,
}: SemanticBlockRowProps) {
  const visibleEnd = Math.min(block.wordEnd, visibleWordCount - 1)
  const hasVisibleWords = visibleEnd >= block.wordStart
  const streaming = isTranscribing && visibleEnd < block.wordEnd
  const semanticStyle = getSemanticStyle(block.type)

  const visibleWords = hasVisibleWords
    ? words.slice(block.wordStart, visibleEnd + 1)
    : []

  return (
    <article
      className={[
        "rounded-xl border px-3 py-3 transition-colors",
        active ? "border-zinc-200/35 bg-zinc-100/9" : "border-white/10 bg-black/24",
      ].join(" ")}
      style={{
        boxShadow: active ? `0 0 24px -14px ${semanticStyle.glow}` : "none",
      }}
    >
      <button
        onClick={() => {
          if (!hasVisibleWords) {
            return
          }
          onBlockSelect(block.wordStart, visibleEnd)
        }}
        className="mb-2 flex w-full items-start justify-between gap-3 rounded-md px-1 py-0.5 text-left transition hover:bg-white/4"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="h-1.5 w-6 rounded-full"
              style={{ backgroundColor: semanticStyle.border }}
            />
            <p className="truncate text-xs font-semibold tracking-[0.12em] text-zinc-300 uppercase">
              {block.label}
            </p>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">{block.summary}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[11px] text-zinc-400">
            {formatSeconds(block.start)} - {formatSeconds(block.end)}
          </p>
          <p className="text-[10px] text-zinc-500">{block.confidence}%</p>
        </div>
      </button>

      <div className="rounded-lg border border-white/8 bg-black/35 px-2.5 py-2">
        {hasVisibleWords ? (
          <div className="flex flex-wrap gap-x-1.5 gap-y-1">
            {visibleWords.map((word, offset) => {
              const globalIndex = block.wordStart + offset
              return (
                <button
                  key={word.id}
                  type="button"
                  draggable={false}
                  onMouseDown={(event) => {
                    event.preventDefault()
                    onWordSelect(globalIndex, event.shiftKey)
                  }}
                  onMouseEnter={(event) => {
                    if (event.buttons === 1) {
                      onWordSelect(globalIndex, true)
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault()
                      onWordSelect(globalIndex, event.shiftKey)
                    }
                  }}
                  className={[
                    "rounded-sm px-1 text-[13px] leading-6 transition outline-none",
                    isSelected(globalIndex, selection)
                      ? "bg-zinc-200/24 text-zinc-100"
                      : "text-zinc-300 hover:bg-white/8 hover:text-zinc-100",
                    activeWordIndex === globalIndex ? "ring-1 ring-zinc-300/40" : "",
                  ].join(" ")}
                >
                  {word.text}
                </button>
              )
            })}
          </div>
        ) : (
          <p className="text-xs text-zinc-500">Ожидание данных распознавания...</p>
        )}

        {streaming ? (
          <div className="mt-2 rounded-md border border-white/10 bg-white/5 px-2 py-1">
            <ShinyText text="ИИ дополняет сегмент..." speed={2.2} className="text-[11px]" />
          </div>
        ) : null}
      </div>
    </article>
  )
})

export function SemanticBlockTranscript({
  blocks,
  words,
  visibleWordCount,
  activeWordIndex,
  activeBlockId,
  selection,
  isTranscribing,
  onWordSelect,
  onBlockSelect,
}: SemanticBlockTranscriptProps) {
  const parentRef = useRef<HTMLDivElement | null>(null)

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: blocks.length,
    getItemKey: (index) => blocks[index]?.id ?? index,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 198,
    overscan: 4,
  })

  const items = virtualizer.getVirtualItems()

  const completion = useMemo(() => {
    if (words.length === 0) {
      return 0
    }
    return Math.min(100, Math.round((visibleWordCount / words.length) * 100))
  }, [visibleWordCount, words.length])

  return (
    <section className="flex h-full min-h-0 flex-col">
      <header className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <div>
          <p className="text-xs tracking-[0.15em] text-zinc-500 uppercase">Семантическая расшифровка</p>
          <p className="text-[11px] text-zinc-400">
            {blocks.length} блоков · {visibleWordCount}/{words.length} слов
          </p>
        </div>
        <p className="text-xs text-zinc-400">{completion}%</p>
      </header>

      <div ref={parentRef} className="min-h-0 flex-1 overflow-auto px-3 py-3">
        <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
          {items.map((item) => {
            const block = blocks[item.index]
            if (!block) {
              return null
            }

            return (
              <div
                key={item.key}
                data-index={item.index}
                ref={virtualizer.measureElement}
                className="absolute left-0 top-0 w-full pb-2"
                style={{ transform: `translateY(${item.start}px)` }}
              >
                <SemanticBlockRow
                  block={block}
                  words={words}
                  visibleWordCount={visibleWordCount}
                  activeWordIndex={activeWordIndex}
                  active={activeBlockId === block.id}
                  selection={selection}
                  isTranscribing={isTranscribing}
                  onWordSelect={onWordSelect}
                  onBlockSelect={onBlockSelect}
                />
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
