import {
  BellIcon,
  FilmIcon,
  NewspaperIcon,
  Settings2Icon,
  ShieldUserIcon,
  SparklesIcon,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import type { NewsItem, Project } from "@/app/types"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { DashboardSection } from "@/features/dashboard/types"

type SidebarProps = {
  news: NewsItem[]
  projects: Project[]
  activeSection: DashboardSection
  onSectionChange: (section: DashboardSection) => void
}

const sectionList = [
  { id: "projects", labelKey: "dashboard.sections.projects", icon: FilmIcon },
  { id: "news", labelKey: "dashboard.sections.news", icon: NewspaperIcon },
  { id: "updates", labelKey: "dashboard.sections.updates", icon: BellIcon },
  { id: "account", labelKey: "dashboard.sections.account", icon: ShieldUserIcon },
  { id: "settings", labelKey: "dashboard.sections.settings", icon: Settings2Icon },
] as const

function initialsFromLabel(value: string): string {
  const parts = value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
  if (parts.length === 0) {
    return "WS"
  }
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("")
}

export function Sidebar({ news, projects, activeSection, onSectionChange }: SidebarProps) {
  const { t } = useTranslation()
  const totalProjects = projects.length
  const totalClips = projects.reduce((sum, project) => sum + Math.max(0, project.clips), 0)
  const workspaceLabel =
    projects.find((project) => project.sourceUploader?.trim())?.sourceUploader?.trim() ??
    t("dashboard.profile.localWorkspace")
  const workspaceInitials = initialsFromLabel(workspaceLabel)
  return (
    <aside
      className="flex min-h-0 w-full shrink-0 flex-col gap-4 pr-0 lg:max-w-72 lg:pr-2"
      data-scroll-region="true"
    >
      <Card className="glass-panel border-white/12 bg-white/4 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-300">{t("dashboard.profile.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-content-center rounded-xl border border-white/12 bg-gradient-to-br from-zinc-300/20 to-zinc-200/5 text-sm font-semibold text-zinc-200">
              {workspaceInitials}
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-100">{workspaceLabel}</p>
              <p className="text-xs text-zinc-400">
                {t("dashboard.profile.activeProjects", { count: totalProjects })}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-white/10 bg-black/25 p-2">
              <p className="text-zinc-500">{t("dashboard.profile.projects")}</p>
              <p className="mt-0.5 text-sm font-semibold text-zinc-100">{totalProjects}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/25 p-2">
              <p className="text-zinc-500">{t("dashboard.profile.clips")}</p>
              <p className="mt-0.5 text-sm font-semibold text-zinc-100">{totalClips}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-panel border-white/12 bg-white/4 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-300">{t("dashboard.sectionsTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {sectionList.map((section) => {
            const Icon = section.icon
            const active = section.id === activeSection
            return (
              <button
                key={section.id}
                onClick={() => onSectionChange(section.id)}
                className={[
                  "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-sm transition",
                  active
                    ? "border-white/14 bg-white/10 text-zinc-100"
                    : "border-transparent text-zinc-400 hover:border-white/10 hover:bg-white/6 hover:text-zinc-200",
                ].join(" ")}
                >
                <Icon className="size-4" />
                {t(section.labelKey)}
              </button>
            )
          })}
        </CardContent>
      </Card>

      <Card className="glass-panel border-white/12 bg-white/4 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm text-zinc-300">
            <SparklesIcon className="size-4 text-zinc-300" />
            {t("dashboard.productFeed")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {news.slice(0, 2).map((item) => (
            <div key={item.id} className="rounded-lg border border-white/10 bg-black/20 p-2.5">
              <div className="mb-1 flex items-center justify-between">
                <Badge variant="outline" className="border-white/15 text-zinc-300">
                  {item.label}
                </Badge>
                <span className="text-[11px] text-zinc-500">{item.timestamp}</span>
              </div>
              <p className="text-xs leading-relaxed text-zinc-300">{item.title}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </aside>
  )
}
