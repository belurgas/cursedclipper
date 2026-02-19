import { useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import {
  BellIcon,
  CheckCheckIcon,
  MinusIcon,
  SquareIcon,
  XIcon,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { getTauriWindow, isTauriRuntime } from "@/shared/tauri/runtime"

type WindowAction = "minimize" | "maximize" | "close"

export type AppNotificationItem = {
  id: string
  title: string
  description?: string
  timestamp: string
  createdAt: number
  unread: boolean
  tone: "info" | "success" | "error"
}

type AppChromeProps = {
  notifications: AppNotificationItem[]
  onOpenNotification: (notificationId: string) => void
  onMarkAllRead: () => void
}

function toneMarker(tone: AppNotificationItem["tone"]) {
  if (tone === "success") {
    return "bg-emerald-300/85"
  }
  if (tone === "error") {
    return "bg-rose-300/85"
  }
  return "bg-zinc-300/80"
}

export function AppChrome({
  notifications,
  onOpenNotification,
  onMarkAllRead,
}: AppChromeProps) {
  const { t } = useTranslation()
  const [isMaximized, setIsMaximized] = useState<boolean>(
    () => document.fullscreenElement !== null,
  )
  const [notificationsOpen, setNotificationsOpen] = useState(false)

  const hasUnread = useMemo(
    () => notifications.some((item) => item.unread),
    [notifications],
  )

  useEffect(() => {
    if (isTauriRuntime()) {
      const windowHandle = getTauriWindow()
      if (!windowHandle) {
        return
      }

      let unlistenResize: (() => void) | null = null
      void windowHandle.isMaximized().then(setIsMaximized).catch(() => {})
      void windowHandle
        .onResized(async () => {
          try {
            setIsMaximized(await windowHandle.isMaximized())
          } catch {
            // no-op
          }
        })
        .then((cleanup) => {
          unlistenResize = cleanup
        })
        .catch(() => {})

      return () => {
        if (unlistenResize) {
          unlistenResize()
        }
      }
    }

    const onFullscreenChange = () => {
      setIsMaximized(document.fullscreenElement !== null)
    }
    document.addEventListener("fullscreenchange", onFullscreenChange)
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange)
  }, [])

  const handleAction = async (action: WindowAction) => {
    if (isTauriRuntime()) {
      const windowHandle = getTauriWindow()
      if (windowHandle) {
        try {
          if (action === "minimize") {
            await windowHandle.minimize()
          } else if (action === "maximize") {
            await windowHandle.toggleMaximize()
            setIsMaximized(await windowHandle.isMaximized())
          } else {
            await windowHandle.close()
          }
          return
        } catch {
          // continue with web fallback
        }
      }
    }

    if (action === "maximize") {
      try {
        if (document.fullscreenElement) {
          await document.exitFullscreen()
        } else {
          await document.documentElement.requestFullscreen()
        }
      } catch {
        // no-op in unsupported contexts
      }
      setIsMaximized(document.fullscreenElement !== null)
      return
    }

    if (action === "minimize") {
      return
    }

    if (action === "close") {
      try {
        window.close()
      } catch {
        // no-op in restricted contexts
      }
    }
  }

  return (
    <motion.header
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      onDoubleClick={(event) => {
        const target = event.target as HTMLElement
        if (target.closest("[data-no-drag='true']")) {
          return
        }
        void handleAction("maximize")
      }}
      className="absolute inset-x-0 top-0 z-[200] h-10 select-none border-none bg-transparent shadow-none backdrop-blur-none"
      style={{
        backgroundColor: "transparent",
        border: "0",
        boxShadow: "none",
        backdropFilter: "none",
      }}
    >
      <div className="mx-auto flex h-full w-full items-center justify-between px-3 lg:px-5">
        <div className="flex flex-1 items-center" data-tauri-drag-region>
          <p className="text-[11px] font-medium tracking-[0.2em] text-zinc-500 uppercase">
            CURSED CLIPPER
          </p>
        </div>

        <div className="flex items-center gap-1" data-no-drag="true">
          <DropdownMenu
            open={notificationsOpen}
            onOpenChange={(open) => {
              setNotificationsOpen(open)
              if (open) {
                onMarkAllRead()
              }
            }}
          >
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="relative grid h-6 w-6 place-content-center rounded-md border border-transparent text-zinc-400 transition hover:border-white/10 hover:bg-white/8 hover:text-zinc-200"
                aria-label={t("app.notifications")}
                title={t("app.notifications")}
              >
                <BellIcon className="size-3.5" />
                {hasUnread ? (
                  <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.8)]" />
                ) : null}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sideOffset={8}
              className="z-[330] w-[360px] overflow-hidden rounded-xl border border-white/12 bg-[#0b0d12]/94 p-0 text-zinc-100 shadow-[0_20px_48px_-24px_rgba(0,0,0,0.86)] backdrop-blur-xl"
            >
              <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
                <p className="text-xs tracking-[0.14em] text-zinc-400 uppercase">
                  {t("app.notifications")}
                </p>
                <button
                  type="button"
                  onClick={onMarkAllRead}
                  className="inline-flex items-center gap-1 rounded-md border border-white/12 bg-white/6 px-2 py-1 text-[11px] text-zinc-300 transition hover:bg-white/10 hover:text-zinc-100"
                >
                  <CheckCheckIcon className="size-3.5" />
                  {t("app.markRead")}
                </button>
              </div>

              <div className="max-h-[360px] overflow-x-hidden overflow-y-auto p-2">
                {notifications.length === 0 ? (
                  <div className="rounded-lg border border-white/10 bg-black/24 px-3 py-3 text-xs text-zinc-400">
                    {t("app.noEvents")}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {notifications.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          onOpenNotification(item.id)
                          setNotificationsOpen(false)
                        }}
                        className={[
                          "w-full max-w-full overflow-hidden rounded-lg border px-2.5 py-2 text-left transition",
                          item.unread
                            ? "border-zinc-200/20 bg-zinc-100/10"
                            : "border-white/10 bg-white/5 hover:bg-white/8",
                        ].join(" ")}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-zinc-100">
                            <span className={["h-1.5 w-1.5 shrink-0 rounded-full", toneMarker(item.tone)].join(" ")} />
                            <span className="truncate">{item.title}</span>
                          </p>
                          <span className="shrink-0 text-[10px] text-zinc-500">{item.timestamp}</span>
                        </div>
                        {item.description ? (
                          <p className="mt-1 whitespace-normal break-all text-[11px] leading-relaxed text-zinc-400">
                            {item.description}
                          </p>
                        ) : null}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            type="button"
            onClick={() => {
              void handleAction("minimize")
            }}
            className="grid h-6 w-6 place-content-center rounded-md border border-transparent text-zinc-400 transition hover:border-white/10 hover:bg-white/8 hover:text-zinc-200"
            aria-label={t("app.minimize")}
            title={t("app.minimize")}
          >
            <MinusIcon className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              void handleAction("maximize")
            }}
            className="grid h-6 w-6 place-content-center rounded-md border border-transparent text-zinc-400 transition hover:border-white/10 hover:bg-white/8 hover:text-zinc-200"
            aria-label={isMaximized ? t("app.restore") : t("app.maximize")}
            title={isMaximized ? t("app.restore") : t("app.maximize")}
          >
            <SquareIcon className="size-3" />
          </button>
          <button
            type="button"
            onClick={() => {
              void handleAction("close")
            }}
            className="grid h-6 w-6 place-content-center rounded-md border border-transparent text-zinc-400 transition hover:border-rose-300/30 hover:bg-rose-400/18 hover:text-rose-100"
            aria-label={t("app.close")}
            title={t("app.close")}
          >
            <XIcon className="size-3.5" />
          </button>
        </div>
      </div>
    </motion.header>
  )
}
