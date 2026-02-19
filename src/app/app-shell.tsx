import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

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
import i18n from "@/shared/i18n/i18n"
import {
  hasStoredUiLanguage,
  normalizeUiLanguage,
  resolveIntlLocale,
  setStoredUiLanguage,
} from "@/shared/i18n/language"
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

const formatNotificationTime = (date: Date, locale: string) =>
  new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)

const normalizeWindowsExtendedPath = (value: string) => {
  if (value.startsWith("\\\\?\\UNC\\")) {
    return `\\\\${value.slice("\\\\?\\UNC\\".length)}`
  }
  if (value.startsWith("\\\\?\\")) {
    return value.slice("\\\\?\\".length)
  }
  return value
}

const isLikelyFilesystemPath = (value: string) =>
  /^[a-zA-Z]:[\\/]/.test(value) ||
  value.startsWith("\\\\") ||
  value.startsWith("/") ||
  value.startsWith("\\\\?\\")

const canOpenProjectWorkspace = (project: Project) => {
  if (!project.sourceType) {
    return true
  }
  if (project.sourceStatus === "pending") {
    return false
  }
  if (project.sourceType === "youtube") {
    return Boolean(project.importedMediaPath?.trim())
  }
  if (project.sourceType === "local") {
    return Boolean(project.importedMediaPath?.trim() || project.sourceUrl?.trim())
  }
  return true
}

export function AppShell() {
  const { t, i18n: i18nState } = useTranslation()
  const appLocale = resolveIntlLocale(normalizeUiLanguage(i18nState.language))
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
  const hiddenProgressTasksRef = useRef<Record<string, boolean>>({})
  const taskNotificationIdsRef = useRef<Record<string, string>>({})
  const taskLatestRef = useRef<
    Record<
      string,
      {
        title: string
        description: string
        target?: NotificationTarget
        progress: number | null
      }
    >
  >({})
  const taskProgressDispatchAtRef = useRef<Record<string, number>>({})
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
        timestamp: formatNotificationTime(now, appLocale),
        unread: true,
      }
      setNotifications((previous) => [notification, ...previous].slice(0, MAX_NOTIFICATIONS))
    },
    [appLocale],
  )

  const upsertTaskNotification = useCallback(
    (
      task: string,
      payload: Omit<AppNotification, "id" | "createdAt" | "timestamp" | "unread">,
    ) => {
      const now = new Date()
      setNotifications((previous) => {
        const existingId = taskNotificationIdsRef.current[task]
        if (existingId) {
          const hasExisting = previous.some((item) => item.id === existingId)
          if (hasExisting) {
            return previous.map((item) =>
              item.id === existingId
                ? {
                    ...item,
                    ...payload,
                    createdAt: now.getTime(),
                    timestamp: formatNotificationTime(now, appLocale),
                    unread: true,
                  }
                : item,
            )
          }
        }

        const nextId = `ntf-task-${task}-${Math.random().toString(36).slice(2, 8)}`
        taskNotificationIdsRef.current[task] = nextId
        const nextItem: AppNotification = {
          id: nextId,
          title: payload.title,
          description: payload.description,
          tone: payload.tone,
          target: payload.target,
          createdAt: now.getTime(),
          timestamp: formatNotificationTime(now, appLocale),
          unread: true,
        }
        return [nextItem, ...previous].slice(0, MAX_NOTIFICATIONS)
      })
    },
    [appLocale],
  )

  const markAllNotificationsRead = useCallback(() => {
    setNotifications((previous) => previous.map((item) => ({ ...item, unread: false })))
  }, [])

  const tryOpenWorkspaceProject = useCallback(
    (projectId: string, requestedMode: WorkspaceMode | null = null) => {
      const project = projects.find((candidate) => candidate.id === projectId)
      if (!project) {
        return
      }
      if (!canOpenProjectWorkspace(project)) {
        pushToast({
          title: t("appShell.sourceNotReadyTitle"),
          description:
            project.sourceStatus === "pending"
              ? t("appShell.sourceNotReadyPending")
              : t("appShell.sourceNotReadyMissing"),
          tone: "info",
          durationMs: 3200,
        })
        return
      }
      setWorkspaceModeRequest(requestedMode)
      setActiveProjectId(projectId)
    },
    [projects, pushToast, t],
  )

  const openNotification = useCallback(
    (notificationId: string) => {
      const target = notifications.find((item) => item.id === notificationId)?.target
      setNotifications((previous) =>
        previous.map((item) =>
          item.id === notificationId ? { ...item, unread: false } : item,
        ),
      )

      if (!target) {
        return
      }

      if (target.kind === "section") {
        setActiveProjectId(null)
        setWorkspaceModeRequest(null)
        setActiveDashboardSection(target.section)
        return
      }

      tryOpenWorkspaceProject(target.projectId, target.mode ?? null)
    },
    [notifications, tryOpenWorkspaceProject],
  )

  const updateProject = useCallback(
    (projectId: string, patch: Partial<Project>) => {
      setProjects((previous) =>
        previous.map((project) =>
          project.id === projectId
            ? { ...project, ...patch, updatedAt: t("appShell.justNow") }
            : project,
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
        sourceViewCount: patch.sourceViewCount,
        sourceViewCountPrevious: patch.sourceViewCountPrevious,
        sourceLikeCount: patch.sourceLikeCount,
        sourceLikeCountPrevious: patch.sourceLikeCountPrevious,
        sourceCommentCount: patch.sourceCommentCount,
        sourceCommentCountPrevious: patch.sourceCommentCountPrevious,
        sourceUploadDate: patch.sourceUploadDate,
        sourceChannelId: patch.sourceChannelId,
        sourceChannelUrl: patch.sourceChannelUrl,
        sourceChannelFollowers: patch.sourceChannelFollowers,
        sourceChannelFollowersPrevious: patch.sourceChannelFollowersPrevious,
        sourceMetricsUpdatedAt: patch.sourceMetricsUpdatedAt,
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
          pushToast({
            title: t("appShell.patchNotSavedTitle"),
            description:
              error instanceof Error && error.message.trim()
                ? error.message
                : t("appShell.patchNotSavedDescription"),
            tone: "error",
            durationMs: 3600,
          })
        })
    },
    [pushToast, t],
  )

  useEffect(() => {
    let cancelled = false

    void Promise.all([
      fetchDashboardData(),
      getRuntimeToolsStatus().catch(() => null),
    ])
      .then(([payload, toolsStatus]) => {
        if (cancelled) {
          return
        }
        if (toolsStatus?.settings?.uiLanguage && !hasStoredUiLanguage()) {
          const normalizedLanguage = normalizeUiLanguage(toolsStatus.settings.uiLanguage)
          setStoredUiLanguage(normalizedLanguage)
          if (normalizeUiLanguage(i18n.language) !== normalizedLanguage) {
            void i18n.changeLanguage(normalizedLanguage)
          }
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
      .catch((error) => {
        console.error("Failed to bootstrap app shell:", error)
      })
      .finally(() => {
        if (!cancelled) {
          setIsBooting(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let unlisten: (() => void) | null = null
    let disposed = false

    const resolveNotificationTarget = (
      task: string,
      status: RuntimeInstallProgressEvent["status"],
    ): NotificationTarget | undefined => {
      const youtubeTaskMatch = task.match(/^youtube-download:(.+)$/)
      if (youtubeTaskMatch?.[1]) {
        return {
          kind: "workspace",
          projectId: youtubeTaskMatch[1],
          mode: status === "success" ? "video" : "clips",
        }
      }
      const clipExportTaskMatch = task.match(/^clip-export:(.+)$/)
      if (clipExportTaskMatch?.[1]) {
        return {
          kind: "workspace",
          projectId: clipExportTaskMatch[1],
          mode: "export",
        }
      }
      if (task === "ffmpeg" || task === "ytdlp") {
        return { kind: "section", section: "settings" }
      }
      return undefined
    }

    const moveTaskToNotifications = (task: string) => {
      const latest = taskLatestRef.current[task]
      if (!latest) {
        return
      }
      const progressSuffix =
        typeof latest.progress === "number" ? ` • ${Math.round(latest.progress * 100)}%` : ""
      upsertTaskNotification(task, {
        title: latest.title,
        description: `${latest.description}${progressSuffix}`,
        tone: "info",
        target: latest.target,
      })
    }

    const handleProgress = (event: RuntimeInstallProgressEvent) => {
      const now = performance.now()
      const lastDispatchAt = taskProgressDispatchAtRef.current[event.task] ?? 0
      if (
        event.status === "progress" &&
        now - lastDispatchAt < 110
      ) {
        return
      }
      taskProgressDispatchAtRef.current[event.task] = now

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
      const detail =
        typeof event.detail === "string" ? normalizeWindowsExtendedPath(event.detail) : null
      const title =
        event.title ??
        (event.task.startsWith("youtube-download")
          ? t("appShell.taskYoutubeImport")
          : event.task === "ffmpeg"
            ? t("appShell.taskFfmpegInstall")
            : event.task === "ytdlp"
              ? t("appShell.taskYtdlpInstall")
              : t("appShell.taskBackground"))
      const description = detail ? `${event.message} • ${detail}` : event.message
      const target = resolveNotificationTarget(event.task, event.status)
      const youtubeProjectId = event.task.match(/^youtube-download:(.+)$/)?.[1] ?? null
      taskLatestRef.current[event.task] = {
        title,
        description,
        target,
        progress: normalizedProgress,
      }

      const isHiddenTask = Boolean(hiddenProgressTasksRef.current[event.task])
      if (isHiddenTask && !isFinal) {
        moveTaskToNotifications(event.task)
        return
      }

      let resolvedToastId = toastId
      if (!isHiddenTask) {
        if (!toastId) {
          const id = pushToast({
            title,
            description,
            tone:
              event.status === "error"
                ? "error"
                : event.status === "success"
                  ? "success"
                  : "progress",
            progress: normalizedProgress,
            persistent: !isFinal,
            durationMs: isFinal ? 3600 : undefined,
            collapsible: true,
            onDismiss: ({ reason }) => {
              if (reason !== "manual" || isFinal) {
                return
              }
              hiddenProgressTasksRef.current[event.task] = true
              delete installToastIdsRef.current[event.task]
              moveTaskToNotifications(event.task)
            },
          })
          installToastIdsRef.current[event.task] = id
          resolvedToastId = id
        } else {
          updateToast(toastId, {
            title,
            description,
            tone:
              event.status === "error"
                ? "error"
                : event.status === "success"
                  ? "success"
                  : "progress",
            progress: normalizedProgress,
            persistent: !isFinal,
            durationMs: isFinal ? 3600 : undefined,
            collapsible: true,
            onDismiss: ({ reason }) => {
              if (reason !== "manual" || isFinal) {
                return
              }
              hiddenProgressTasksRef.current[event.task] = true
              delete installToastIdsRef.current[event.task]
              moveTaskToNotifications(event.task)
            },
          })
        }
      }

      if (isFinal) {
        if (youtubeProjectId) {
          if (event.status === "success") {
            const patch: Partial<Project> = {
              sourceStatus: "ready",
            }
            if (detail && isLikelyFilesystemPath(detail)) {
              patch.importedMediaPath = detail
            }
            updateProject(youtubeProjectId, patch)
          } else if (event.status === "error") {
            updateProject(youtubeProjectId, { sourceStatus: "failed" })
          }
        }

        upsertTaskNotification(event.task, {
          title,
          description,
          tone: event.status === "error" ? "error" : "success",
          target,
        })

        void getRuntimeToolsStatus()
          .then((status) => setRuntimeStatus(status))
          .catch(() => {})

        delete hiddenProgressTasksRef.current[event.task]
        const toastIdForCleanup = resolvedToastId
        window.setTimeout(() => {
          delete installTaskProgressRef.current[event.task]
          delete taskLatestRef.current[event.task]
          delete taskProgressDispatchAtRef.current[event.task]
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
  }, [pushToast, t, updateProject, updateToast, upsertTaskNotification])

  const deleteProject = useCallback((projectId: string) => {
    const previousProjects = projects
    const removedProject = previousProjects.find((project) => project.id === projectId) ?? null

    setProjects((previous) => previous.filter((project) => project.id !== projectId))
    if (activeProjectId === projectId) {
      setActiveProjectId(null)
      setWorkspaceModeRequest(null)
    }

    appendNotification({
      title: t("appShell.projectDeletedTitle"),
      description: t("appShell.projectDeletedDescription"),
      tone: "info",
      target: { kind: "section", section: "projects" },
    })

    void deleteProjectViaBackend(projectId).catch((error) => {
      console.error("Failed to delete project:", error)
      setProjects(previousProjects)
      pushToast({
        title: t("appShell.deleteFailedTitle"),
        description:
          error instanceof Error && error.message.trim()
            ? error.message
            : t("appShell.deleteFailedDescription"),
        tone: "error",
        durationMs: 3600,
      })
      if (removedProject) {
        appendNotification({
          title: t("appShell.deleteRolledBackTitle"),
          description: t("appShell.deleteRolledBackDescription", { name: removedProject.name }),
          tone: "info",
          target: { kind: "section", section: "projects" },
        })
      }
    })
  }, [activeProjectId, appendNotification, projects, pushToast, t])

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [activeProjectId, projects],
  )

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-[#05070a] text-zinc-100">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[#05070a]" />
      <AppChrome
        notifications={notifications}
        onOpenNotification={openNotification}
        onMarkAllRead={markAllNotificationsRead}
      />
      <div className="min-h-0 flex-1 overflow-hidden">
        {isBooting ? (
          <LoadingScreen />
        ) : activeProject ? (
          <WorkspaceView
            key={`workspace-${activeProject.id}-${workspaceModeRequest ?? "default"}`}
            project={activeProject}
            initialMode={workspaceModeRequest}
            onProjectPatch={updateProject}
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
                title: t("appShell.projectCreatedTitle"),
                description: t("appShell.projectCreatedDescription", { name: project.name }),
                tone: "success",
                target: { kind: "workspace", projectId: project.id, mode: "video" },
              })
            }}
            onUpdateProject={updateProject}
            onDeleteProject={deleteProject}
            onOpenProject={(projectId) => {
              tryOpenWorkspaceProject(projectId, null)
            }}
          />
        )}
      </div>
    </div>
  )
}
