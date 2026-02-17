import { AnimatePresence, motion } from "framer-motion"
import { SparklesIcon } from "lucide-react"

import type { NewsItem, Project } from "@/app/types"
import { Card, CardContent } from "@/components/ui/card"
import { AccountView } from "@/features/dashboard/account-view"
import { CreateProjectDialog } from "@/features/dashboard/create-project-dialog"
import { FeedView } from "@/features/dashboard/feed-view"
import { ProjectCard } from "@/features/dashboard/project-card"
import { SettingsView } from "@/features/dashboard/settings-view"
import { Sidebar } from "@/features/dashboard/sidebar"
import type { DashboardSection } from "@/features/dashboard/types"
import { AmbientBackground } from "@/shared/react-bits/ambient-background"
import type { RuntimeToolsStatus } from "@/shared/tauri/backend"
import { ShinyText } from "@/shared/react-bits/shiny-text"

type DashboardViewProps = {
  projects: Project[]
  newsFeed: NewsItem[]
  updatesFeed: NewsItem[]
  activeSection: DashboardSection
  onSectionChange: (section: DashboardSection) => void
  runtimeStatus?: RuntimeToolsStatus | null
  onRuntimeStatusChange?: (status: RuntimeToolsStatus) => void
  onCreateProject: (project: Project) => void
  onUpdateProject: (projectId: string, patch: Partial<Project>) => void
  onDeleteProject: (projectId: string) => void
  onOpenProject: (projectId: string) => void
}

const sectionText: Record<DashboardSection, { badge: string; title: string; description: string }> =
  {
    projects: {
      badge: "ИИ-монтаж",
      title: "Проекты",
      description: "Создавайте, уточняйте и экспортируйте клипы с семантической точностью.",
    },
    news: {
      badge: "Лента",
      title: "Новости",
      description: "Тренды и инсайты по коротким форматам и ИИ-клиппингу.",
    },
    updates: {
      badge: "Продукт",
      title: "Обновления",
      description: "Что нового в ClipForge: функции, интерфейс и качество генерации.",
    },
    account: {
      badge: "Профиль",
      title: "Аккаунт",
      description: "Управление профилем, уведомлениями и безопасностью.",
    },
    settings: {
      badge: "Система",
      title: "Настройки",
      description: "Конфигурация runtime, импортов и инструментов медиа-обработки.",
    },
  }

export function DashboardView({
  projects,
  newsFeed,
  updatesFeed,
  activeSection,
  onSectionChange,
  runtimeStatus,
  onRuntimeStatusChange,
  onCreateProject,
  onUpdateProject,
  onDeleteProject,
  onOpenProject,
}: DashboardViewProps) {
  return (
    <section className="relative mx-auto h-full w-full min-h-0 overflow-visible px-4 pb-5 pt-12 lg:px-6 lg:pt-14">
      <AmbientBackground variant="dashboard" />

      <motion.div
        key="dashboard"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.28, ease: "easeOut" }}
        className="relative z-10 flex h-full min-h-0 w-full flex-col gap-4 lg:flex-row lg:gap-5"
      >
        <Sidebar
          news={newsFeed}
          activeSection={activeSection}
          onSectionChange={onSectionChange}
        />

        <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden lg:gap-5">
          <Card className="glass-panel border-white/12 bg-white/3 backdrop-blur-xl">
            <CardContent className="flex flex-col gap-4 py-5 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs tracking-[0.2em] text-zinc-500 uppercase">
                  {sectionText[activeSection].badge}
                </p>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-100">
                  {sectionText[activeSection].title}
                </h1>
                <p className="mt-1 text-sm text-zinc-400">
                  {sectionText[activeSection].description}
                </p>
              </div>
              {activeSection === "projects" ? (
                <CreateProjectDialog onCreate={onCreateProject} onUpdateProject={onUpdateProject} />
              ) : (
                <div className="rounded-lg border border-white/10 bg-black/24 px-3 py-2">
                  <ShinyText
                    text="ИИ-ассистент обновляет данные в фоновом режиме."
                    speed={2.3}
                    className="text-xs"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <section
            className="min-h-0 flex-1 overflow-x-visible overflow-y-auto pr-1 pb-3 lg:pr-2"
            data-scroll-region="true"
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={activeSection}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                className="space-y-4"
              >
                {activeSection === "projects" ? (
                  <>
                    <section className="grid grid-cols-1 gap-4 px-1 py-1 md:grid-cols-2 xl:grid-cols-3">
                      {projects.map((project) => (
                        <ProjectCard
                          key={project.id}
                          project={project}
                          onOpen={onOpenProject}
                          onDelete={onDeleteProject}
                        />
                      ))}
                    </section>

                    {projects.length === 0 ? (
                      <Card className="border-white/12 bg-white/4 backdrop-blur-xl">
                        <CardContent className="flex items-center justify-center gap-2 py-10 text-zinc-400">
                          <SparklesIcon className="size-4" />
                          Создайте первый проект, чтобы начать сборку клипов.
                        </CardContent>
                      </Card>
                    ) : null}
                  </>
                ) : null}

                {activeSection === "news" ? (
                  <FeedView
                    title="Новости рынка и контента"
                    description="Кураторская лента рекомендаций по контент-стратегии."
                    items={newsFeed}
                  />
                ) : null}

                {activeSection === "updates" ? (
                  <FeedView
                    title="Обновления продукта"
                    description="Последние релизы, улучшения интерфейса и ИИ-пайплайна."
                    items={updatesFeed}
                  />
                ) : null}

                {activeSection === "account" ? (
                  <AccountView
                    onLogout={() => {
                      console.info("Сессия завершена (мок).")
                    }}
                  />
                ) : null}

                {activeSection === "settings" ? (
                  <SettingsView
                    initialStatus={runtimeStatus}
                    onStatusChange={onRuntimeStatusChange}
                  />
                ) : null}
              </motion.div>
            </AnimatePresence>
          </section>
        </main>
      </motion.div>
    </section>
  )
}
