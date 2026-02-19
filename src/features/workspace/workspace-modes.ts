import type { LucideIcon } from "lucide-react"
import {
  ClapperboardIcon,
  DownloadIcon,
  LightbulbIcon,
  ScissorsLineDashedIcon,
  SparklesIcon,
} from "lucide-react"

export type WorkspaceMode = "video" | "clips" | "export" | "insights" | "thumbnails"

export type WorkspaceModeConfig = {
  id: WorkspaceMode
  labelKey:
    | "workspace.modes.video"
    | "workspace.modes.clips"
    | "workspace.modes.export"
    | "workspace.modes.insights"
    | "workspace.modes.thumbnails"
  icon: LucideIcon
}

export const workspaceModes: WorkspaceModeConfig[] = [
  { id: "video", labelKey: "workspace.modes.video", icon: ClapperboardIcon },
  { id: "clips", labelKey: "workspace.modes.clips", icon: ScissorsLineDashedIcon },
  { id: "insights", labelKey: "workspace.modes.insights", icon: LightbulbIcon },
  { id: "thumbnails", labelKey: "workspace.modes.thumbnails", icon: SparklesIcon },
  { id: "export", labelKey: "workspace.modes.export", icon: DownloadIcon },
]
