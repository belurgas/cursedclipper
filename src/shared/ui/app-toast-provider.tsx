import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronUpIcon,
  InfoIcon,
  LoaderCircleIcon,
  XIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"

type ToastTone = "info" | "success" | "error" | "progress"
type ToastDismissReason = "manual" | "timeout" | "programmatic"

type ToastItem = {
  id: string
  title: string
  description?: string
  tone: ToastTone
  progress?: number | null
  persistent?: boolean
  durationMs?: number
  collapsible?: boolean
  collapsed?: boolean
  onDismiss?: (context: {
    id: string
    reason: ToastDismissReason
    toast: ToastItem
  }) => void
}

type ToastInput = Omit<ToastItem, "id">

type ToastContextValue = {
  pushToast: (toast: ToastInput) => string
  updateToast: (id: string, patch: Partial<ToastInput>) => void
  dismissToast: (id: string, reason?: ToastDismissReason) => void
}

const DEFAULT_DURATION_MS = 4200

const toastContext = createContext<ToastContextValue | null>(null)

function toneStyles(tone: ToastTone) {
  if (tone === "success") {
    return {
      icon: CheckCircle2Icon,
      card: "border-emerald-300/25 bg-emerald-400/10 text-emerald-100",
      muted: "text-emerald-100/75",
      progress: "bg-emerald-200/60",
    }
  }
  if (tone === "error") {
    return {
      icon: AlertCircleIcon,
      card: "border-rose-300/25 bg-rose-400/12 text-rose-100",
      muted: "text-rose-100/75",
      progress: "bg-rose-200/70",
    }
  }
  if (tone === "progress") {
    return {
      icon: LoaderCircleIcon,
      card: "border-zinc-200/20 bg-zinc-200/8 text-zinc-100",
      muted: "text-zinc-300",
      progress: "bg-zinc-100/70",
    }
  }
  return {
    icon: InfoIcon,
    card: "border-white/18 bg-white/8 text-zinc-100",
    muted: "text-zinc-300",
    progress: "bg-zinc-100/65",
  }
}

export function AppToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timersRef = useRef<Map<string, number>>(new Map())

  const dismissToast = useCallback((id: string, reason: ToastDismissReason = "programmatic") => {
    const timer = timersRef.current.get(id)
    if (timer) {
      window.clearTimeout(timer)
      timersRef.current.delete(id)
    }
    setToasts((previous) => {
      const target = previous.find((toast) => toast.id === id)
      if (target?.onDismiss) {
        target.onDismiss({ id, reason, toast: target })
      }
      return previous.filter((toast) => toast.id !== id)
    })
  }, [])

  const scheduleDismiss = useCallback(
    (toast: ToastItem) => {
      const existing = timersRef.current.get(toast.id)
      if (existing) {
        window.clearTimeout(existing)
        timersRef.current.delete(toast.id)
      }
      if (toast.persistent) {
        return
      }
      const timeoutMs = toast.durationMs ?? DEFAULT_DURATION_MS
      const timer = window.setTimeout(() => dismissToast(toast.id, "timeout"), timeoutMs)
      timersRef.current.set(toast.id, timer)
    },
    [dismissToast],
  )

  const pushToast = useCallback(
    (toastInput: ToastInput) => {
      const id = `toast_${Math.random().toString(36).slice(2, 10)}`
      const toast: ToastItem = {
        id,
        collapsible: toastInput.collapsible ?? true,
        collapsed: toastInput.collapsed ?? false,
        ...toastInput,
      }
      setToasts((previous) => [...previous, toast])
      scheduleDismiss(toast)
      return id
    },
    [scheduleDismiss],
  )

  const updateToast = useCallback(
    (id: string, patch: Partial<ToastInput>) => {
      setToasts((previous) =>
        previous.map((toast) => {
          if (toast.id !== id) {
            return toast
          }
          const updated: ToastItem = {
            ...toast,
            ...patch,
            collapsed:
              patch.tone === "success" || patch.tone === "error"
                ? false
                : (patch.collapsed ?? toast.collapsed),
          }
          scheduleDismiss(updated)
          return updated
        }),
      )
    },
    [scheduleDismiss],
  )

  const contextValue = useMemo<ToastContextValue>(
    () => ({
      pushToast,
      updateToast,
      dismissToast,
    }),
    [dismissToast, pushToast, updateToast],
  )

  return (
    <toastContext.Provider value={contextValue}>
      {children}
      <div className="pointer-events-none fixed right-4 top-16 z-[180] flex w-[min(360px,calc(100vw-1.5rem))] flex-col gap-2">
        <AnimatePresence initial={false}>
          {toasts.map((toast) => {
            const styles = toneStyles(toast.tone)
            const Icon = styles.icon
            const hasProgress = typeof toast.progress === "number"
            const boundedProgress = hasProgress
              ? Math.max(0, Math.min(100, Math.round((toast.progress ?? 0) * 100)))
              : null

            return (
              <motion.article
                key={toast.id}
                layout
                initial={{ opacity: 0, x: 24, scale: 0.97 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 24, scale: 0.98 }}
                transition={{ duration: 0.24, ease: "easeOut" }}
                className={cn(
                  "pointer-events-auto overflow-hidden rounded-xl border px-3 py-2.5 shadow-[0_14px_36px_-24px_rgba(0,0,0,0.78)] backdrop-blur-xl",
                  styles.card,
                )}
              >
                <div className="flex items-start gap-2">
                  <Icon
                    className={cn(
                      "mt-0.5 size-4 shrink-0",
                      toast.tone === "progress" ? "animate-spin" : "",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{toast.title}</p>
                    {!toast.collapsed && toast.description ? (
                      <p className={cn("mt-0.5 text-xs", styles.muted)}>{toast.description}</p>
                    ) : null}
                    {toast.collapsed && typeof boundedProgress === "number" ? (
                      <p className={cn("mt-0.5 text-[11px]", styles.muted)}>
                        Прогресс: {boundedProgress}%
                      </p>
                    ) : null}
                  </div>

                  <div className="mt-0.5 flex shrink-0 items-center gap-1">
                    {toast.collapsible ? (
                      <button
                        type="button"
                        className="rounded-md p-1 text-zinc-300/80 transition hover:bg-white/10 hover:text-zinc-100"
                        onClick={() =>
                          setToasts((previous) =>
                            previous.map((candidate) =>
                              candidate.id === toast.id
                                ? { ...candidate, collapsed: !candidate.collapsed }
                                : candidate,
                            ),
                          )
                        }
                      >
                        {toast.collapsed ? (
                          <ChevronDownIcon className="size-3.5" />
                        ) : (
                          <ChevronUpIcon className="size-3.5" />
                        )}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="rounded-md p-1 text-zinc-300/80 transition hover:bg-white/10 hover:text-zinc-100"
                      onClick={() => dismissToast(toast.id, "manual")}
                    >
                      <XIcon className="size-3.5" />
                    </button>
                  </div>
                </div>

                {!toast.collapsed && hasProgress ? (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/25">
                    <motion.div
                      initial={false}
                      animate={{ width: `${boundedProgress}%` }}
                      transition={{ duration: 0.26, ease: "easeOut" }}
                      className={cn("h-full rounded-full", styles.progress)}
                    />
                  </div>
                ) : !toast.collapsed && toast.tone === "progress" ? (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/25">
                    <motion.div
                      animate={{ opacity: [0.35, 0.95, 0.35] }}
                      transition={{ duration: 1.2, ease: "easeInOut", repeat: Infinity }}
                      className={cn(
                        "h-full w-full rounded-full bg-gradient-to-r from-white/10 via-white/70 to-white/10",
                      )}
                    />
                  </div>
                ) : null}
              </motion.article>
            )
          })}
        </AnimatePresence>
      </div>
    </toastContext.Provider>
  )
}

export function useAppToast() {
  const context = useContext(toastContext)
  if (!context) {
    throw new Error("useAppToast must be used within AppToastProvider")
  }
  return context
}
