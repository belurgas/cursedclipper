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
  label: string
  icon: LucideIcon
}

export const workspaceModes: WorkspaceModeConfig[] = [
  { id: "video", label: "Редактор", icon: ClapperboardIcon },
  { id: "clips", label: "Клипы", icon: ScissorsLineDashedIcon },
  { id: "insights", label: "Аналитика", icon: LightbulbIcon },
  { id: "thumbnails", label: "Обложки", icon: SparklesIcon },
  { id: "export", label: "Экспорт", icon: DownloadIcon },
]
