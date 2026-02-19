import { motion } from "framer-motion"
import { Clock3Icon, ScissorsLineDashedIcon, SparklesIcon, Trash2Icon } from "lucide-react"
import { useTranslation } from "react-i18next"
import type { TFunction } from "i18next"

import { formatDurationLabel } from "@/app/mock-data"
import type { Project } from "@/app/types"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { normalizeUiLanguage, type UiLanguage } from "@/shared/i18n/language"

type ProjectCardProps = {
  project: Project
  onOpen: (projectId: string) => void
  onDelete: (projectId: string) => void
}

function normalizeUpdatedAtLabel(value: string, language: UiLanguage, t: TFunction): string {
  const trimmed = value.trim()
  if (!trimmed) {
    return t("projectCard.relativeJustNow")
  }

  if (/^(just now|только что)$/i.test(trimmed)) {
    return t("projectCard.relativeJustNow")
  }
  if (/^(today|сегодня)$/i.test(trimmed)) {
    return t("projectCard.relativeToday")
  }
  if (/^(yesterday|вчера)$/i.test(trimmed)) {
    return t("projectCard.relativeYesterday")
  }

  const minuteMatch = trimmed.match(
    /^(\d+)\s*(m|min|mins|minute|minutes|мин|мин\.)\s*(ago|назад)?$/i,
  )
  if (minuteMatch) {
    return t("projectCard.relativeMinutesAgo", { count: Number(minuteMatch[1]) })
  }

  const hourMatch = trimmed.match(
    /^(\d+)\s*(h|hr|hrs|hour|hours|ч|час|часа|часов)\s*(ago|назад)?$/i,
  )
  if (hourMatch) {
    return t("projectCard.relativeHoursAgo", { count: Number(hourMatch[1]) })
  }

  const dayMatch = trimmed.match(
    /^(\d+)\s*(d|day|days|д|дн|дня|дней)\s*(ago|назад)?$/i,
  )
  if (dayMatch) {
    return t("projectCard.relativeDaysAgo", { count: Number(dayMatch[1]) })
  }

  if (language === "en") {
    return trimmed
      .replace(/^только что$/i, t("projectCard.relativeJustNow"))
      .replace(/^сегодня$/i, t("projectCard.relativeToday"))
      .replace(/^вчера$/i, t("projectCard.relativeYesterday"))
  }

  return trimmed
    .replace(/^just now$/i, t("projectCard.relativeJustNow"))
    .replace(/^today$/i, t("projectCard.relativeToday"))
    .replace(/^yesterday$/i, t("projectCard.relativeYesterday"))
}

export function ProjectCard({ project, onOpen, onDelete }: ProjectCardProps) {
  const { t, i18n } = useTranslation()
  const language = normalizeUiLanguage(i18n.language)
  const localizedUpdatedAt = normalizeUpdatedAtLabel(project.updatedAt, language, t)
  const statusMap: Record<Project["status"], string> = {
    ready: t("projectCard.statusReady"),
    processing: t("projectCard.statusProcessing"),
    draft: t("projectCard.statusDraft"),
  }

  const sourceStatusMap = {
    pending: t("projectCard.sourcePending"),
    failed: t("projectCard.sourceFailed"),
  } as const

  const canOpenProject =
    !project.sourceType ||
    (project.sourceStatus !== "pending" &&
      (project.sourceType !== "youtube" ||
        Boolean(project.importedMediaPath?.trim())) &&
      (project.sourceType !== "local" ||
        Boolean(project.importedMediaPath?.trim() || project.sourceUrl?.trim())))

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -12, scale: 0.98 }}
      transition={{ duration: 0.32, ease: "easeOut" }}
      className="h-full"
    >
      <Card className="glass-panel group h-full overflow-hidden border-white/12 bg-white/5 transition-[background-color,border-color] duration-200 hover:border-white/20 hover:bg-white/6">
        <CardHeader className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="line-clamp-2 text-sm font-semibold text-zinc-100">
              {project.name}
            </CardTitle>
            <Badge
              variant={project.status === "ready" ? "default" : "outline"}
              className={
                project.status === "ready"
                  ? "bg-zinc-300/20 text-zinc-200"
                  : "border-white/20 text-zinc-300"
              }
            >
              {statusMap[project.status]}
            </Badge>
          </div>
          <p className="line-clamp-2 text-xs leading-relaxed text-zinc-400">
            {project.description}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-white/10 bg-black/20 p-2">
              <p className="text-zinc-500">{t("projectCard.duration")}</p>
              <p className="mt-1 flex items-center gap-1 font-medium text-zinc-200">
                <Clock3Icon className="size-3.5" />
                {formatDurationLabel(project.durationSeconds)}
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/20 p-2">
              <p className="text-zinc-500">{t("projectCard.clips")}</p>
              <p className="mt-1 flex items-center gap-1 font-medium text-zinc-200">
                <ScissorsLineDashedIcon className="size-3.5" />
                {project.clips}
              </p>
            </div>
          </div>

          {project.sourceType === "youtube" && project.sourceStatus && project.sourceStatus !== "ready" ? (
            <div
              className={[
                "rounded-lg border px-2 py-1 text-xs",
                project.sourceStatus === "failed"
                  ? "border-rose-300/20 bg-rose-400/10 text-rose-100"
                  : "border-white/10 bg-black/20 text-zinc-300",
              ].join(" ")}
            >
              {project.sourceStatus === "failed"
                ? sourceStatusMap.failed
                : sourceStatusMap.pending}
              {project.sourceUploader ? ` • ${project.sourceUploader}` : ""}
              {project.sourceDurationSeconds
                ? t("projectCard.sourceDuration", { seconds: project.sourceDurationSeconds })
                : ""}
            </div>
          ) : null}

          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500">
              {t("projectCard.updatedAt", { value: localizedUpdatedAt })}
            </span>
            <div className="flex items-center gap-1.5">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-rose-300/20 bg-rose-400/8 text-rose-100 hover:bg-rose-400/14"
                  >
                    <Trash2Icon className="size-3.5" />
                    {t("projectCard.delete")}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="border-white/12 bg-[#090b10]/96 text-zinc-100">
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("projectCard.deleteConfirmTitle")}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("projectCard.deleteConfirmDescription", { name: project.name })}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="border-white/12 bg-white/6 text-zinc-200 hover:bg-white/10">
                      {t("projectCard.cancel")}
                    </AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={() => onDelete(project.id)}
                      className="bg-rose-500/85 text-rose-50 hover:bg-rose-500"
                    >
                      {t("projectCard.deleteProject")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button
                size="sm"
                className="bg-zinc-100/10 text-zinc-100 hover:bg-zinc-100/20"
                disabled={!canOpenProject}
                title={canOpenProject ? t("projectCard.openProject") : t("projectCard.sourceNotReady")}
                onClick={() => onOpen(project.id)}
              >
                <SparklesIcon className="size-3.5" />
                {t("projectCard.open")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
