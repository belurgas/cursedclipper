import { motion } from "framer-motion"

import type { Project } from "@/app/types"
import { AnalyticsOverviewPanel } from "@/features/workspace/analytics-overview-panel"
import { ContentPlanPanel } from "@/features/workspace/content-plan-panel"
import { HooksPanel } from "@/features/workspace/hooks-panel"
import { SeriesSegmentationPanel } from "@/features/workspace/series-segmentation-panel"
import { ViralScorePanel } from "@/features/workspace/viral-score-panel"
import type { WorkspaceController } from "@/features/workspace/workspace-controller-types"

type InsightsModeProps = {
  controller: WorkspaceController
  project: Project
}

export default function InsightsMode({ controller, project }: InsightsModeProps) {
  const { ai, actions, media, transcript, semanticBlocks, clips } = controller

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex h-full min-h-0 flex-col gap-3 overflow-x-hidden overflow-y-auto pr-1 pb-3"
      data-scroll-region="true"
    >
      <div className="min-w-0">
        <AnalyticsOverviewPanel
          videoName={media.videoName}
          duration={media.duration}
          words={transcript.words}
          visibleWordCount={transcript.visibleWordCount}
          semanticBlocks={semanticBlocks}
          clipsCount={clips.length}
          sourceUploader={project.sourceUploader}
          sourceDurationSeconds={project.sourceDurationSeconds}
          sourceLabel={project.sourceLabel}
        />
      </div>

      <div className="grid min-w-0 auto-rows-min items-start gap-3 xl:grid-cols-2">
        <div className="min-w-0 space-y-3">
          <ViralScorePanel
            score={ai.viralScore}
            insights={ai.viralInsights}
            processing={ai.isScoring}
          />
          <ContentPlanPanel ideas={ai.contentPlanIdeas} processing={ai.isPlanning} />
        </div>

        <div className="min-w-0 space-y-3">
          <HooksPanel
            hooks={ai.hookCandidates}
            processing={ai.isHooking}
            onGenerate={actions.regenerateHooks}
          />
          <SeriesSegmentationPanel segments={ai.seriesSegments} processing={ai.isSegmenting} />
        </div>
      </div>
    </motion.div>
  )
}
