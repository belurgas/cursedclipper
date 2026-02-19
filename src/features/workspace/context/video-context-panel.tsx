import {
  ListVideoIcon,
  SparklesIcon,
  UploadIcon,
} from "lucide-react"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import { formatSeconds } from "@/app/mock-data"
import { Button } from "@/components/ui/button"
import type { TranscriptSemanticBlock } from "@/app/types"
import type { WorkspaceController } from "@/features/workspace/workspace-controller-types"
import { ShinyText } from "@/shared/react-bits/shiny-text"

type VideoContextPanelProps = {
  controller: WorkspaceController
  onOpenFilePicker: () => void
  onSeekToTime: (time: number) => void
}

export default function VideoContextPanel({
  controller,
  onOpenFilePicker,
  onSeekToTime,
}: VideoContextPanelProps) {
  const { t } = useTranslation()
  const { ai, transcript, actions, media } = controller

  const focusBlock = (block: TranscriptSemanticBlock) => {
    const safeEnd = Math.min(block.wordEnd, Math.max(0, transcript.visibleWordCount - 1))
    actions.setSelectionRange(block.wordStart, safeEnd)
    onSeekToTime(block.start)
  }

  const hookToBlockMap = useMemo(() => {
    const visibleBlocks = transcript.visibleTranscriptBlocks
    if (visibleBlocks.length === 0 || ai.hookCandidates.length === 0) {
      return new Map<string, TranscriptSemanticBlock>()
    }

    const tokenize = (value: string) =>
      value
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]+/gu, " ")
        .split(/\s+/)
        .filter((token) => token.length >= 4)

    const blockTokens = visibleBlocks.map((block) => {
      const safeEnd = Math.min(block.wordEnd, Math.max(0, transcript.visibleWordCount - 1))
      const text = transcript.words
        .slice(block.wordStart, safeEnd + 1)
        .map((word) => word.text)
        .join(" ")
      return { block, tokens: new Set(tokenize(text)) }
    })

    const mapped = new Map<string, TranscriptSemanticBlock>()
    for (const hook of ai.hookCandidates) {
      const hookTokens = tokenize(hook.headline)
      let bestBlock: TranscriptSemanticBlock | null = null
      let bestScore = -1

      for (const candidate of blockTokens) {
        let score = 0
        for (const token of hookTokens) {
          if (candidate.tokens.has(token)) {
            score += 1
          }
        }
        if (score > bestScore) {
          bestScore = score
          bestBlock = candidate.block
        }
      }

      if (!bestBlock) {
        bestBlock = visibleBlocks[0]
      }
      mapped.set(hook.id, bestBlock)
    }

    return mapped
  }, [ai.hookCandidates, transcript.visibleTranscriptBlocks, transcript.visibleWordCount, transcript.words])

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-white/10 bg-black/26 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs tracking-[0.15em] text-zinc-500 uppercase">{t("videoContextPanel.sourceTitle")}</p>
          <Button
            size="xs"
            variant="outline"
            className="border-white/15 bg-transparent text-zinc-200 hover:bg-white/8"
            onClick={onOpenFilePicker}
          >
            <UploadIcon className="size-3.5" />
            {t("videoContextPanel.replace")}
          </Button>
        </div>
        <p className="mt-1 text-xs text-zinc-400">
          {t("videoContextPanel.sourceDescription")}
        </p>
      </div>

      <div className="rounded-xl border border-white/10 bg-black/24 p-3">
        <p className="text-xs tracking-[0.15em] text-zinc-500 uppercase">{t("videoContextPanel.aiPipelineTitle")}</p>
        <div className="mt-2 space-y-1.5">
          {[
            {
              id: "video-analysis",
              label: t("videoContextPanel.pipeline.videoAnalysis"),
              ready: !ai.isAnalyzingVideo && Boolean(ai.videoAnalysis),
              processing: ai.isAnalyzingVideo,
            },
            {
              id: "transcript",
              label: t("videoContextPanel.pipeline.transcription"),
              ready: !transcript.isTranscribing && transcript.words.length > 0,
              processing: transcript.isTranscribing,
            },
            {
              id: "score",
              label: t("videoContextPanel.pipeline.scoring"),
              ready: ai.viralScore !== null,
              processing: ai.isScoring,
            },
            {
              id: "hooks",
              label: t("videoContextPanel.pipeline.hooks"),
              ready: ai.hookCandidates.length > 0,
              processing: ai.isHooking,
            },
            {
              id: "plan",
              label: t("videoContextPanel.pipeline.contentPlan"),
              ready: ai.contentPlanIdeas.length > 0,
              processing: ai.isPlanning,
            },
          ].map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-md border border-white/10 bg-white/4 px-2.5 py-2"
            >
              <p className="text-xs text-zinc-300">{item.label}</p>
              <span
                className={[
                  "text-[11px]",
                  item.ready
                    ? "text-zinc-100"
                    : item.processing
                      ? "text-zinc-300"
                      : "text-zinc-500",
                ].join(" ")}
              >
                {item.ready
                  ? t("videoContextPanel.statusReady")
                  : item.processing
                    ? t("videoContextPanel.statusInProgress")
                    : t("videoContextPanel.statusWaiting")}
              </span>
            </div>
          ))}
        </div>
        {!transcript.isTranscribing && transcript.words.length === 0 ? (
          <Button
            size="xs"
            className="mt-2 bg-zinc-100 text-zinc-950 hover:bg-zinc-100/90 disabled:bg-zinc-700/35 disabled:text-zinc-400"
            onClick={actions.startTranscription}
            disabled={!media.videoUrl}
          >
            {t("videoContextPanel.startTranscription")}
          </Button>
        ) : null}
        {ai.isAnyProcessing ? (
          <div className="mt-2 rounded-md border border-white/10 bg-white/4 px-2 py-1.5">
            <ShinyText
              text={
                ai.isAnalyzingVideo
                  ? t("videoContextPanel.aiAnalyzingVideo")
                  : t("videoContextPanel.aiUpdatingClippingModel")
              }
              speed={2.1}
              className="text-[11px]"
            />
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-white/10 bg-black/24 p-3">
        <p className="flex items-center gap-1.5 text-xs tracking-[0.15em] text-zinc-500 uppercase">
          <ListVideoIcon className="size-3.5 text-zinc-400" />
          {t("videoContextPanel.semanticBlocksTitle")}
        </p>
        {transcript.visibleTranscriptBlocks.length === 0 ? (
          <p className="mt-2 text-xs text-zinc-500">{t("videoContextPanel.semanticBlocksEmpty")}</p>
        ) : (
          <div className="mt-2 max-h-48 space-y-1.5 overflow-auto pr-1">
            {transcript.visibleTranscriptBlocks.map((block) => (
              <button
                key={block.id}
                type="button"
                onClick={() => focusBlock(block)}
                className={[
                  "w-full rounded-md border px-2.5 py-2 text-left transition",
                  transcript.activeTranscriptBlockId === block.id
                    ? "border-zinc-200/30 bg-zinc-100/10"
                    : "border-white/10 bg-white/4 hover:bg-white/8",
                ].join(" ")}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-zinc-200">{block.label}</p>
                  <span className="text-[10px] text-zinc-500">
                    {formatSeconds(block.start)} - {formatSeconds(block.end)}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-[11px] text-zinc-500">{block.summary}</p>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-white/10 bg-black/24 p-3">
        <p className="flex items-center gap-1.5 text-xs tracking-[0.15em] text-zinc-500 uppercase">
          <SparklesIcon className="size-3.5 text-zinc-400" />
          {t("videoContextPanel.focusHooksTitle")}
        </p>
        {ai.hookCandidates.length === 0 ? (
          <p className="mt-2 text-xs text-zinc-500">{t("videoContextPanel.focusHooksEmpty")}</p>
        ) : (
          <div className="mt-2 space-y-1.5">
            {ai.hookCandidates.slice(0, 3).map((hook) => {
              const block = hookToBlockMap.get(hook.id)
              return (
                <button
                  key={hook.id}
                  type="button"
                  disabled={!block}
                  onClick={() => {
                    if (block) {
                      onSeekToTime(block.start)
                    }
                  }}
                  className="w-full rounded-md border border-white/10 bg-white/4 px-2.5 py-2 text-left transition hover:bg-white/8 disabled:opacity-50"
                >
                  <p className="line-clamp-2 text-xs text-zinc-200">{hook.headline}</p>
                  {block ? (
                    <p className="mt-1 text-[11px] text-zinc-500">
                      {t("videoContextPanel.jumpToBlock", {
                        label: block.label,
                        time: formatSeconds(block.start),
                      })}
                    </p>
                  ) : null}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
