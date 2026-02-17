import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence } from "framer-motion"

import type { NewsItem, Project } from "@/app/types"
import { AppChrome, type AppNotificationItem } from "@/app/app-chrome"
import { DashboardView } from "@/features/dashboard/dashboard-view"
import type { DashboardSection } from "@/features/dashboard/types"
import { LoadingScreen } from "@/features/loading/loading-screen"
import { WorkspaceView } from "@/features/workspace/workspace-view"
import type { WorkspaceMode } from "@/features/workspace/workspace-modes"
import {
  deleteProjectViaBackend,
  fetchDashboardData,
  getRuntimeToolsStatus,
  subscribeRuntimeInstallProgress,
  type RuntimeInstallProgressEvent,
  type RuntimeToolsStatus,
  updateProjectViaBackend,
} from "@/shared/tauri/backend"
import { useAppToast } from "@/shared/ui/app-toast-provider"

type NotificationTarget =
  | {
      kind: "section"
      section: DashboardSection
    }
  | {
      kind: "workspace"
      projectId: string
      mode?: WorkspaceMode
    }

type AppNotification = AppNotificationItem & {
  target?: NotificationTarget
}

const MAX_NOTIFICATIONS = 42

const formatNotificationTime = (date: Date) =>
  new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)

export function AppShell() {
  const [isBooting, setIsBooting] = useState(true)
  const [projects, setProjects] = useState<Project[]>([])
  const [newsFeed, setNewsFeed] = useState<NewsItem[]>([])
  const [updatesFeed, setUpdatesFeed] = useState<NewsItem[]>([])
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeToolsStatus | null>(null)

  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [workspaceModeRequest, setWorkspaceModeRequest] = useState<WorkspaceMode | null>(null)
  const [activeDashboardSection, setActiveDashboardSection] =
    useState<DashboardSection>("projects")

  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const installToastIdsRef = useRef<Record<string, string>>({})
  const installTaskProgressRef = useRef<Record<string, number>>({})
  const { pushToast, updateToast } = useAppToast()

  const appendNotification = useCallback(
    (
      payload: Omit<AppNotification, "id" | "createdAt" | "timestamp" | "unread"> & {
        id?: string
      },
    ) => {
      const now = new Date()
      const notification: AppNotification = {
        id: payload.id ?? `ntf_${Math.random().toString(36).slice(2, 11)}`,
        title: payload.title,
        description: payload.description,
        tone: payload.tone,
        target: payload.target,
        createdAt: now.getTime(),
        timestamp: formatNotificationTime(now),
        unread: true,
      }
      setNotifications((previous) => [notification, ...previous].slice(0, MAX_NOTIFICATIONS))
    },
    [],
  )

  const markAllNotificationsRead = useCallback(() => {
    setNotifications((previous) => previous.map((item) => ({ ...item, unread: false })))
  }, [])

  const openNotification = useCallback((notificationId: string) => {
    setNotifications((previous) => {
      const target = previous.find((item) => item.id === notificationId)?.target
      const next = previous.map((item) =>
        item.id === notificationId ? { ...item, unread: false } : item,
      )

      if (!target) {
        return next
      }

      if (target.kind === "section") {
        setActiveProjectId(null)
        setWorkspaceModeRequest(null)
        setActiveDashboardSection(target.section)
      } else {
        setActiveProjectId(target.projectId)
        setWorkspaceModeRequest(target.mode ?? null)
      }

      return next
    })
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsBooting(false)
    }, 2400)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    let cancelled = false

    void Promise.all([
      fetchDashboardData(),
      getRuntimeToolsStatus().catch(() => null),
    ]).then(([payload, toolsStatus]) => {
      if (cancelled) {
        return
      }
      setProjects(payload.projects)
      setNewsFeed(payload.newsFeed)
      setUpdatesFeed(payload.updatesFeed)
      setRuntimeStatus(toolsStatus)
      setNotifications((previous) => {
        if (previous.length > 0) {
          return previous
        }
        const seeded: AppNotification[] = [
          ...payload.updatesFeed.slice(0, 2).map((item) => ({
            id: `seed-update-${item.id}`,
            title: item.label,
            description: item.title,
            tone: "info" as const,
            createdAt: Date.now(),
            timestamp: item.timestamp,
            unread: false,
            target: { kind: "section", section: "updates" } as NotificationTarget,
          })),
          ...payload.newsFeed.slice(0, 2).map((item) => ({
            id: `seed-news-${item.id}`,
            title: item.label,
            description: item.title,
            tone: "info" as const,
            createdAt: Date.now(),
            timestamp: item.timestamp,
            unread: false,
            target: { kind: "section", section: "news" } as NotificationTarget,
          })),
        ]
        return seeded
      })
    })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let unlisten: (() => void) | null = null
    let disposed = false

    const handleProgress = (event: RuntimeInstallProgressEvent) => {
      const toastId = installToastIdsRef.current[event.task]
      const isFinal = event.status === "success" || event.status === "error"
      const rawProgress = typeof event.progress === "number" ? event.progress : null
      const previousProgress = installTaskProgressRef.current[event.task] ?? 0
      const normalizedProgress =
        rawProgress === null
          ? null
          : Math.max(previousProgress, Math.min(1, Math.max(0, rawProgress)))
      if (normalizedProgress !== null) {
        installTaskProgressRef.current[event.task] = normalizedProgress
      }
      const title =
        event.title ??
        (event.task.startsWith("youtube-download")
          ? "Импорт YouTube"
          : event.task === "ffmpeg"
            ? "Установка FFmpeg"
            : event.task === "ytdlp"
              ? "Установка yt-dlp"
              : "Фоновая задача")
      const description = event.detail ? `${event.message} • ${event.detail}` : event.message

      let resolvedToastId = toastId
      if (!toastId) {
        const id = pushToast({
          title,
          description,
          tone: event.status === "error" ? "error" : event.status === "success" ? "success" : "progress",
          progress: normalizedProgress,
          persistent: !isFinal,
          durationMs: isFinal ? 3600 : undefined,
          collapsible: true,
        })
        installToastIdsRef.current[event.task] = id
        resolvedToastId = id
      } else {
        updateToast(toastId, {
          title,
          description,
          tone: event.status === "error" ? "error" : event.status === "success" ? "success" : "progress",
          progress: normalizedProgress,
          persistent: !isFinal,
          durationMs: isFinal ? 3600 : undefined,
          collapsible: true,
        })
      }

      if (isFinal) {
        const youtubeTaskMatch = event.task.match(/^youtube-download:(.+)$/)
        appendNotification({
          title,
          description,
          tone: event.status === "error" ? "error" : "success",
          target: youtubeTaskMatch?.[1]
            ? {
                kind: "workspace",
                projectId: youtubeTaskMatch[1],
                mode: event.status === "success" ? "video" : "clips",
              }
            : event.task === "ffmpeg" || event.task === "ytdlp"
              ? { kind: "section", section: "settings" }
              : undefined,
        })

        void getRuntimeToolsStatus()
          .then((status) => setRuntimeStatus(status))
          .catch(() => {})

        const toastIdForCleanup = resolvedToastId
        window.setTimeout(() => {
          delete installTaskProgressRef.current[event.task]
          if (toastIdForCleanup && installToastIdsRef.current[event.task] === toastIdForCleanup) {
            delete installToastIdsRef.current[event.task]
          }
        }, 3800)
      }
    }

    void subscribeRuntimeInstallProgress(handleProgress).then((dispose) => {
      if (disposed) {
        dispose()
        return
      }
      unlisten = dispose
    })

    return () => {
      disposed = true
      if (unlisten) {
        unlisten()
      }
    }
  }, [appendNotification, pushToast, updateToast])

  const updateProject = useCallback(
    (projectId: string, patch: Partial<Project>) => {
      setProjects((previous) =>
        previous.map((project) =>
          project.id === projectId ? { ...project, ...patch, updatedAt: "только что" } : project,
        ),
      )

      void updateProjectViaBackend(projectId, {
        name: patch.name,
        description: patch.description,
        status: patch.status,
        clips: patch.clips,
        durationSeconds: patch.durationSeconds,
        sourceType: patch.sourceType,
        sourceLabel: patch.sourceLabel,
        sourceUrl: patch.sourceUrl,
        sourceStatus: patch.sourceStatus,
        sourceUploader: patch.sourceUploader,
        sourceDurationSeconds: patch.sourceDurationSeconds,
        sourceThumbnail: patch.sourceThumbnail,
        importedMediaPath: patch.importedMediaPath,
        updatedAt: patch.updatedAt,
      })
        .then((project) => {
          setProjects((previous) =>
            previous.map((current) => (current.id === projectId ? project : current)),
          )
        })
        .catch((error) => {
          console.error("Failed to persist project patch:", error)
        })
    },
    [],
  )

  const deleteProject = useCallback((projectId: string) => {
    setProjects((previous) => previous.filter((project) => project.id !== projectId))
    if (activeProjectId === projectId) {
      setActiveProjectId(null)
      setWorkspaceModeRequest(null)
    }

    appendNotification({
      title: "Проект удален",
      description: "Проект и связанные состояния удалены из рабочей области.",
      tone: "info",
      target: { kind: "section", section: "projects" },
    })

    void deleteProjectViaBackend(projectId).catch((error) => {
      console.error("Failed to delete project:", error)
    })
  }, [activeProjectId, appendNotification])

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [activeProjectId, projects],
  )

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden text-zinc-100">
      <AppChrome
        notifications={notifications}
        onOpenNotification={openNotification}
        onMarkAllRead={markAllNotificationsRead}
      />
      <div className="min-h-0 flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {isBooting ? (
            <LoadingScreen />
          ) : activeProject ? (
            <WorkspaceView
              key={`workspace-${activeProject.id}-${workspaceModeRequest ?? "default"}`}
              project={activeProject}
              initialMode={workspaceModeRequest}
              onBack={() => {
                setActiveProjectId(null)
                setWorkspaceModeRequest(null)
              }}
              onOpenSettings={() => {
                setActiveProjectId(null)
                setWorkspaceModeRequest(null)
                setActiveDashboardSection("settings")
              }}
            />
          ) : (
            <DashboardView
              key="dashboard-root"
              projects={projects}
              newsFeed={newsFeed}
              updatesFeed={updatesFeed}
              activeSection={activeDashboardSection}
              onSectionChange={setActiveDashboardSection}
              runtimeStatus={runtimeStatus}
              onRuntimeStatusChange={setRuntimeStatus}
              onCreateProject={(project) => {
                setProjects((previous) => [{ ...project }, ...previous])
                appendNotification({
                  title: "Проект создан",
                  description: `Новый проект «${project.name}» добавлен в рабочую область.`,
                  tone: "success",
                  target: { kind: "workspace", projectId: project.id, mode: "video" },
                })
              }}
              onUpdateProject={updateProject}
              onDeleteProject={deleteProject}
              onOpenProject={(projectId) => {
                setWorkspaceModeRequest(null)
                setActiveProjectId(projectId)
              }}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
