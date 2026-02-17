import { motion } from "framer-motion"

import { ThumbnailGeneratorPanel } from "@/features/workspace/thumbnail-generator-panel"
import type { WorkspaceController } from "@/features/workspace/workspace-controller-types"

type ThumbnailsModeProps = {
  controller: WorkspaceController
}

export default function ThumbnailsMode({ controller }: ThumbnailsModeProps) {
  const { ai, media, actions } = controller

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex h-full min-h-0 flex-col gap-3 overflow-x-hidden overflow-y-auto pr-1 pb-3"
      data-scroll-region="true"
    >
      <ThumbnailGeneratorPanel
        templates={ai.thumbnailTemplates}
        activeTemplateId={ai.activeThumbnailTemplateId}
        processing={ai.isThumbnailing}
        duration={media.duration}
        currentTime={media.currentTime}
        onGenerate={actions.regenerateThumbnails}
        onSelectTemplate={actions.setActiveThumbnailTemplateId}
        onUpdateTemplate={actions.updateThumbnailTemplate}
      />
    </motion.div>
  )
}
