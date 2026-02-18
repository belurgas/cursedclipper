import { motion } from "framer-motion"
import { Clock3Icon, ScissorsLineDashedIcon, SparklesIcon, Trash2Icon } from "lucide-react"

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

type ProjectCardProps = {
  project: Project
  onOpen: (projectId: string) => void
  onDelete: (projectId: string) => void
}

const statusMap: Record<Project["status"], string> = {
  ready: "Готов",
  processing: "Обработка",
  draft: "Черновик",
}

const sourceStatusMap = {
  pending: "Импорт: в обработке",
  failed: "Импорт: ошибка",
} as const

export function ProjectCard({ project, onOpen, onDelete }: ProjectCardProps) {
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
      <Card className="group h-full border-white/12 bg-white/4 backdrop-blur-xl transition-[background-color,border-color] duration-200 hover:border-white/20 hover:bg-white/6">
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
              <p className="text-zinc-500">Длительность</p>
              <p className="mt-1 flex items-center gap-1 font-medium text-zinc-200">
                <Clock3Icon className="size-3.5" />
                {formatDurationLabel(project.durationSeconds)}
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/20 p-2">
              <p className="text-zinc-500">Клипы</p>
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
              {project.sourceDurationSeconds ? ` • ~${project.sourceDurationSeconds} с` : ""}
            </div>
          ) : null}

          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500">Обновлено: {project.updatedAt}</span>
            <div className="flex items-center gap-1.5">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-rose-300/20 bg-rose-400/8 text-rose-100 hover:bg-rose-400/14"
                  >
                    <Trash2Icon className="size-3.5" />
                    Удалить
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="border-white/12 bg-[#090b10]/96 text-zinc-100">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Удалить проект?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Проект «{project.name}» будет удален вместе с состоянием монтажа, клипами и
                      прогрессом анализа.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="border-white/12 bg-white/6 text-zinc-200 hover:bg-white/10">
                      Отмена
                    </AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={() => onDelete(project.id)}
                      className="bg-rose-500/85 text-rose-50 hover:bg-rose-500"
                    >
                      Удалить проект
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button
                size="sm"
                className="bg-zinc-100/10 text-zinc-100 hover:bg-zinc-100/20"
                disabled={!canOpenProject}
                title={canOpenProject ? "Открыть проект" : "Источник еще не готов"}
                onClick={() => onOpen(project.id)}
              >
                <SparklesIcon className="size-3.5" />
                Открыть
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
