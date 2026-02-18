import {
  createProjectDraft,
  initialProjects,
  makeMockTranscript,
  newsFeed,
  updatesFeed,
} from "@/app/mock-data"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import type {
  ClipSegment,
  ContentPlanIdea,
  ExportClipDraft,
  HookCandidate,
  NewsItem,
  PlatformPreset,
  Project,
  ProjectSourceStatus,
  ProjectSourceType,
  SemanticBlock,
  SeriesSegment,
  SubtitlePreset,
  ThumbnailTemplate,
  TranscriptSemanticBlock,
  TranscriptWord,
  ViralInsight,
  WordRange,
} from "@/app/types"
import {
  buildContentPlanIdeas,
  buildHookCandidates,
  buildSemanticBlocks,
  buildSeriesSegments,
  buildThumbnailTemplates,
  buildTranscriptSemanticBlocks,
  buildViralInsights,
  computeViralScore,
  platformPresets,
  subtitlePresets,
} from "@/features/workspace/mock-ai"
import type { WorkspaceMode } from "@/features/workspace/workspace-modes"
import { isTauriRuntime, invokeTauri } from "@/shared/tauri/runtime"

export const RUNTIME_INSTALL_PROGRESS_EVENT = "runtime-tools://install-progress"

export type DashboardDataPayload = {
  projects: Project[]
  newsFeed: NewsItem[]
  updatesFeed: NewsItem[]
}

function normalizeWindowsExtendedPath(value?: string | null): string | undefined {
  if (typeof value !== "string") {
    return undefined
  }
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }
  if (trimmed.startsWith("\\\\?\\UNC\\")) {
    return `\\\\${trimmed.slice("\\\\?\\UNC\\".length)}`
  }
  if (trimmed.startsWith("\\\\?\\")) {
    return trimmed.slice("\\\\?\\".length)
  }
  return trimmed
}

function normalizeProjectPathFields(project: Project): Project {
  return {
    ...project,
    importedMediaPath: normalizeWindowsExtendedPath(project.importedMediaPath),
  }
}

export type ProjectDraftSourcePayload = {
  sourceType?: ProjectSourceType
  sourceLabel?: string
  sourceUrl?: string
  sourceStatus?: ProjectSourceStatus
  sourceUploader?: string
  sourceDurationSeconds?: number
  sourceThumbnail?: string
  sourceViewCount?: number
  sourceLikeCount?: number
  sourceCommentCount?: number
  sourceUploadDate?: string
  sourceChannelId?: string
  sourceChannelUrl?: string
  sourceChannelFollowers?: number
  importedMediaPath?: string
}

export type ProjectPatchPayload = {
  name?: string
  description?: string
  status?: "ready" | "processing" | "draft"
  clips?: number
  durationSeconds?: number
  sourceType?: ProjectSourceType
  sourceLabel?: string
  sourceUrl?: string
  sourceStatus?: ProjectSourceStatus
  sourceUploader?: string
  sourceDurationSeconds?: number
  sourceThumbnail?: string
  sourceViewCount?: number
  sourceLikeCount?: number
  sourceCommentCount?: number
  sourceUploadDate?: string
  sourceChannelId?: string
  sourceChannelUrl?: string
  sourceChannelFollowers?: number
  importedMediaPath?: string
  updatedAt?: string
}

export type WorkspaceMockPayload = {
  words: TranscriptWord[]
  semanticBlocks: SemanticBlock[]
  transcriptBlocks: TranscriptSemanticBlock[]
  viralScore: number
  viralInsights: ViralInsight[]
  hookCandidates: HookCandidate[]
  contentPlanIdeas: ContentPlanIdea[]
  seriesSegments: SeriesSegment[]
  subtitlePresets: SubtitlePreset[]
  platformPresets: PlatformPreset[]
  thumbnailTemplates: ThumbnailTemplate[]
  activeSubtitlePresetId: string
  defaultSelectedPlatformPresetIds: string[]
}

export type RuntimeToolsSettings = {
  ytdlpMode: "managed" | "custom" | "system"
  ytdlpCustomPath?: string | null
  ffmpegCustomPath?: string | null
  ffprobeCustomPath?: string | null
  projectsRootDir?: string | null
  autoUpdateYtdlp: boolean
  preferBundledFfmpeg: boolean
}

export type ToolStatus = {
  name: string
  available: boolean
  source: string
  path?: string | null
  version?: string | null
  message?: string | null
}

export type RuntimeToolsStatus = {
  settings: RuntimeToolsSettings
  ffmpeg: ToolStatus
  ffprobe: ToolStatus
  ytdlp: ToolStatus
  ytdlpSystemAvailable: boolean
  projectsDir: string
}

export type RuntimeInstallProgressEvent = {
  task: string
  title?: string | null
  status: "progress" | "success" | "error"
  message: string
  detail?: string | null
  progress?: number | null
}

export type YoutubeFormatOption = {
  id: string
  label: string
  ext: string
  resolution: string
  fps?: number | null
  filesize?: number | null
  vcodec: string
  acodec: string
  audioOnly: boolean
  videoOnly: boolean
}

export type YoutubeProbeResult = {
  title: string
  uploader?: string | null
  duration?: number | null
  thumbnail?: string | null
  viewCount?: number | null
  likeCount?: number | null
  commentCount?: number | null
  uploadDate?: string | null
  channelId?: string | null
  channelUrl?: string | null
  channelFollowers?: number | null
  formats: YoutubeFormatOption[]
}

export type YoutubeDownloadRequest = {
  url: string
  formatId: string
  videoOnly?: boolean
  audioOnly?: boolean
  includeAudio?: boolean
  projectName?: string
  taskId?: string
}

export type YoutubeDownloadResult = {
  outputPath: string
  sourceUrl: string
  formatId: string
  durationSeconds?: number | null
}

export type WorkspacePersistedState = {
  version: number
  media: {
    videoName: string
    videoUrl: string
    duration: number
  }
  transcript: {
    words: TranscriptWord[]
    visibleWordCount: number
    transcriptBlocks: TranscriptSemanticBlock[]
    selection: WordRange | null
  }
  clips: ClipSegment[]
  activeClipId: string | null
  semanticBlocks: SemanticBlock[]
  ai: {
    viralScore: number | null
    viralInsights: ViralInsight[]
    hookCandidates: HookCandidate[]
    contentPlanIdeas: ContentPlanIdea[]
    seriesSegments: SeriesSegment[]
    subtitlePresets: SubtitlePreset[]
    platformPresets: PlatformPreset[]
    activeSubtitlePresetId: string
    selectedPlatformPresetIds: string[]
    thumbnailTemplates: ThumbnailTemplate[]
    activeThumbnailTemplateId: string
  }
  exportState?: {
    clipDrafts: Record<string, ExportClipDraft>
  }
}

export type ClipExportPlatformTask = {
  clipId: string
  platformId: string
  aspect: string
  start: number
  end: number
  title?: string | null
  description?: string | null
  tags?: string | null
  coverPath?: string | null
}

export type ClipBatchExportRequest = {
  projectId: string
  projectName?: string
  sourcePath: string
  taskId?: string
  tasks: ClipExportPlatformTask[]
}

export type ClipExportArtifact = {
  clipId: string
  platformId: string
  outputPath: string
  durationSeconds: number
  coverPath?: string | null
}

export type ClipBatchExportResult = {
  projectDir: string
  exportedCount: number
  artifacts: ClipExportArtifact[]
}

export type ProjectResumeState = {
  activeMode: WorkspaceMode
  currentTime: number
  activeClipId?: string | null
  updatedAtUnix: number
}

const workspaceStateStorageKey = (projectId: string) =>
  `cursed-clipper:workspace:${projectId}`
const workspaceResumeStorageKey = (projectId: string) =>
  `cursed-clipper:resume:${projectId}`
// Legacy keys are kept for one-time migration after brand rename.
const legacyWorkspaceStateStorageKey = (projectId: string) =>
  `clipforge:workspace:${projectId}`
const legacyWorkspaceResumeStorageKey = (projectId: string) =>
  `clipforge:resume:${projectId}`

const writeLocalWorkspaceState = (
  projectId: string,
  state: WorkspacePersistedState,
): string | null => {
  if (typeof window === "undefined") {
    return null
  }
  try {
    const serialized = JSON.stringify(state)
    window.localStorage.setItem(workspaceStateStorageKey(projectId), serialized)
    return serialized
  } catch {
    return null
  }
}

const readLocalWorkspaceState = (projectId: string): WorkspacePersistedState | null => {
  if (typeof window === "undefined") {
    return null
  }
  try {
    const nextKey = workspaceStateStorageKey(projectId)
    const legacyKey = legacyWorkspaceStateStorageKey(projectId)
    const raw =
      window.localStorage.getItem(nextKey) ?? window.localStorage.getItem(legacyKey)
    if (!raw) {
      return null
    }
    if (!window.localStorage.getItem(nextKey)) {
      window.localStorage.setItem(nextKey, raw)
      window.localStorage.removeItem(legacyKey)
    }
    return JSON.parse(raw) as WorkspacePersistedState
  } catch {
    return null
  }
}

const writeLocalResumeState = (
  projectId: string,
  payload: Pick<ProjectResumeState, "activeMode" | "currentTime" | "activeClipId">,
): ProjectResumeState | null => {
  if (typeof window === "undefined") {
    return null
  }
  try {
    const next: ProjectResumeState = {
      ...payload,
      updatedAtUnix: Date.now(),
    }
    window.localStorage.setItem(workspaceResumeStorageKey(projectId), JSON.stringify(next))
    return next
  } catch {
    return null
  }
}

const readLocalResumeState = (projectId: string): ProjectResumeState | null => {
  if (typeof window === "undefined") {
    return null
  }
  try {
    const nextKey = workspaceResumeStorageKey(projectId)
    const legacyKey = legacyWorkspaceResumeStorageKey(projectId)
    const raw =
      window.localStorage.getItem(nextKey) ?? window.localStorage.getItem(legacyKey)
    if (!raw) {
      return null
    }
    if (!window.localStorage.getItem(nextKey)) {
      window.localStorage.setItem(nextKey, raw)
      window.localStorage.removeItem(legacyKey)
    }
    return JSON.parse(raw) as ProjectResumeState
  } catch {
    return null
  }
}

const defaultPlatformSelection = ["pf_tiktok", "pf_shorts"]

const fallbackWorkspacePayload = (
  projectName: string,
  duration: number,
): WorkspaceMockPayload => {
  const safeDuration = Math.max(duration, 60)
  const words = makeMockTranscript(safeDuration)
  const semanticBlocks = buildSemanticBlocks(safeDuration)
  const transcriptBlocks = buildTranscriptSemanticBlocks(words)
  const viralScore = computeViralScore(words)
  const viralInsights = buildViralInsights(viralScore)
  const hookCandidates = buildHookCandidates(projectName, words)
  const contentPlanIdeas = buildContentPlanIdeas(projectName, hookCandidates)
  const seriesSegments = buildSeriesSegments(semanticBlocks, safeDuration)
  const thumbnailTemplates = buildThumbnailTemplates(projectName, safeDuration)

  return {
    words,
    semanticBlocks,
    transcriptBlocks,
    viralScore,
    viralInsights,
    hookCandidates,
    contentPlanIdeas,
    seriesSegments,
    subtitlePresets,
    platformPresets,
    thumbnailTemplates,
    activeSubtitlePresetId: subtitlePresets[0]?.id ?? "",
    defaultSelectedPlatformPresetIds: defaultPlatformSelection,
  }
}

export async function fetchDashboardData(): Promise<DashboardDataPayload> {
  if (!isTauriRuntime()) {
    return {
      projects: initialProjects,
      newsFeed,
      updatesFeed,
    }
  }

  try {
    const payload = await invokeTauri<DashboardDataPayload>("get_dashboard_data")
    return {
      ...payload,
      projects: payload.projects.map(normalizeProjectPathFields),
    }
  } catch (error) {
    console.error("Failed to load dashboard data from Rust backend:", error)
    return {
      projects: initialProjects,
      newsFeed,
      updatesFeed,
    }
  }
}

export async function createProjectDraftViaBackend(
  name: string,
  description: string,
  source?: ProjectDraftSourcePayload,
): Promise<Project> {
  if (!isTauriRuntime()) {
    return {
      ...createProjectDraft(name, description),
      ...source,
    }
  }

  try {
    const project = await invokeTauri<Project>("create_project_draft", {
      name,
      description,
      sourceType: source?.sourceType,
      sourceLabel: source?.sourceLabel,
      sourceUrl: source?.sourceUrl,
      sourceStatus: source?.sourceStatus,
      sourceUploader: source?.sourceUploader,
      sourceDurationSeconds: source?.sourceDurationSeconds,
      sourceThumbnail: source?.sourceThumbnail,
      sourceViewCount: source?.sourceViewCount,
      sourceLikeCount: source?.sourceLikeCount,
      sourceCommentCount: source?.sourceCommentCount,
      sourceUploadDate: source?.sourceUploadDate,
      sourceChannelId: source?.sourceChannelId,
      sourceChannelUrl: source?.sourceChannelUrl,
      sourceChannelFollowers: source?.sourceChannelFollowers,
      importedMediaPath: normalizeWindowsExtendedPath(source?.importedMediaPath),
    })
    return normalizeProjectPathFields(project)
  } catch (error) {
    console.error("Failed to create project via Rust backend:", error)
    return {
      ...createProjectDraft(name, description),
      ...source,
    }
  }
}

export async function updateProjectViaBackend(
  projectId: string,
  patch: ProjectPatchPayload,
): Promise<Project> {
  if (!isTauriRuntime()) {
    throw new Error("Обновление проекта доступно только в desktop runtime.")
  }
  const payload = {
    ...patch,
    importedMediaPath: normalizeWindowsExtendedPath(patch.importedMediaPath),
  }
  const project = await invokeTauri<Project>("patch_project", { projectId, patch: payload })
  return normalizeProjectPathFields(project)
}

export async function deleteProjectViaBackend(projectId: string): Promise<boolean> {
  if (!isTauriRuntime()) {
    return true
  }
  return invokeTauri<boolean>("delete_project", { projectId })
}

export async function generateWorkspaceMockViaBackend(
  projectName: string,
  duration: number,
): Promise<WorkspaceMockPayload> {
  if (!isTauriRuntime()) {
    return fallbackWorkspacePayload(projectName, duration)
  }

  try {
    return await invokeTauri<WorkspaceMockPayload>("generate_workspace_mock", {
      projectName,
      duration,
    })
  } catch (error) {
    console.error("Failed to build workspace payload via Rust backend:", error)
    return fallbackWorkspacePayload(projectName, duration)
  }
}

export async function regenerateHooksViaBackend(
  projectName: string,
  words: TranscriptWord[],
): Promise<HookCandidate[]> {
  if (!isTauriRuntime()) {
    return buildHookCandidates(projectName, words)
  }

  try {
    return await invokeTauri<HookCandidate[]>("regenerate_hooks", {
      projectName,
      words,
    })
  } catch (error) {
    console.error("Failed to regenerate hooks via Rust backend:", error)
    return buildHookCandidates(projectName, words)
  }
}

export async function regenerateThumbnailsViaBackend(
  projectName: string,
  duration: number,
): Promise<ThumbnailTemplate[]> {
  if (!isTauriRuntime()) {
    return buildThumbnailTemplates(projectName, duration)
  }

  try {
    return await invokeTauri<ThumbnailTemplate[]>("regenerate_thumbnails", {
      projectName,
      duration,
    })
  } catch (error) {
    console.error("Failed to regenerate thumbnails via Rust backend:", error)
    return buildThumbnailTemplates(projectName, duration)
  }
}

export async function getRuntimeToolsStatus(): Promise<RuntimeToolsStatus> {
  const fallback: RuntimeToolsStatus = {
    settings: {
      ytdlpMode: "managed",
      ytdlpCustomPath: null,
      ffmpegCustomPath: null,
      ffprobeCustomPath: null,
      projectsRootDir: null,
      autoUpdateYtdlp: false,
      preferBundledFfmpeg: true,
    },
    ffmpeg: {
      name: "ffmpeg",
      available: false,
      source: "missing",
      message: "Проверка доступна в Tauri runtime.",
    },
    ffprobe: {
      name: "ffprobe",
      available: false,
      source: "missing",
      message: "Проверка доступна в Tauri runtime.",
    },
    ytdlp: {
      name: "yt-dlp",
      available: false,
      source: "missing",
      message: "Проверка доступна в Tauri runtime.",
    },
    ytdlpSystemAvailable: false,
    projectsDir: "imports",
  }

  if (!isTauriRuntime()) {
    return fallback
  }
  try {
    return await invokeTauri<RuntimeToolsStatus>("get_runtime_tools_status")
  } catch (error) {
    console.error("Failed to fetch tools status:", error)
    return fallback
  }
}

export async function getRuntimeToolsSettings(): Promise<RuntimeToolsSettings> {
  if (!isTauriRuntime()) {
    return {
      ytdlpMode: "managed",
      ytdlpCustomPath: null,
      ffmpegCustomPath: null,
      ffprobeCustomPath: null,
      projectsRootDir: null,
      autoUpdateYtdlp: false,
      preferBundledFfmpeg: true,
    }
  }
  return invokeTauri<RuntimeToolsSettings>("get_runtime_tools_settings")
}

export async function saveRuntimeToolsSettings(
  settings: RuntimeToolsSettings,
): Promise<RuntimeToolsSettings> {
  if (!isTauriRuntime()) {
    return settings
  }
  return invokeTauri<RuntimeToolsSettings>("save_runtime_tools_settings", {
    settings,
  })
}

export async function installOrUpdateManagedYtdlp(): Promise<ToolStatus> {
  if (!isTauriRuntime()) {
    throw new Error("Установка доступна только в desktop runtime.")
  }
  return invokeTauri<ToolStatus>("install_or_update_managed_ytdlp")
}

export async function installOrUpdateManagedFfmpeg(): Promise<RuntimeToolsStatus> {
  if (!isTauriRuntime()) {
    throw new Error("Установка доступна только в desktop runtime.")
  }
  return invokeTauri<RuntimeToolsStatus>("install_or_update_managed_ffmpeg")
}

export async function pickProjectsRootDir(): Promise<string | null> {
  if (!isTauriRuntime()) {
    return null
  }
  return invokeTauri<string | null>("pick_projects_root_dir")
}

export async function pickLocalVideoFile(): Promise<string | null> {
  if (!isTauriRuntime()) {
    return null
  }
  return invokeTauri<string | null>("pick_local_video_file")
}

export async function pickLocalCoverImageFile(): Promise<string | null> {
  if (!isTauriRuntime()) {
    return null
  }
  return invokeTauri<string | null>("pick_local_cover_image_file")
}

export async function stageLocalVideoFile(
  sourcePath: string,
  projectName?: string,
): Promise<string> {
  if (!isTauriRuntime()) {
    return sourcePath
  }
  return invokeTauri<string>("stage_local_video_file", {
    sourcePath,
    projectName: projectName ?? null,
  })
}

export async function openProjectsRootDir(): Promise<string> {
  if (!isTauriRuntime()) {
    throw new Error("Открытие папки доступно только в desktop runtime.")
  }
  return invokeTauri<string>("open_projects_root_dir")
}

export async function openPathInFileManager(path: string): Promise<string> {
  if (!isTauriRuntime()) {
    throw new Error("Открытие пути доступно только в desktop runtime.")
  }
  return invokeTauri<string>("open_path_in_file_manager", { path })
}

export async function subscribeRuntimeInstallProgress(
  handler: (event: RuntimeInstallProgressEvent) => void,
): Promise<UnlistenFn> {
  if (!isTauriRuntime()) {
    return () => {}
  }

  return listen<RuntimeInstallProgressEvent>(
    RUNTIME_INSTALL_PROGRESS_EVENT,
    ({ payload }) => handler(payload),
  )
}

export async function saveProjectWorkspaceState(
  projectId: string,
  state: WorkspacePersistedState,
): Promise<void> {
  const serialized = writeLocalWorkspaceState(projectId, state) ?? JSON.stringify(state)
  if (!isTauriRuntime()) {
    return
  }
  return invokeTauri<void>("save_project_workspace_state", {
    projectId,
    stateJson: serialized,
  })
}

export async function loadProjectWorkspaceState(
  projectId: string,
): Promise<WorkspacePersistedState | null> {
  if (!isTauriRuntime()) {
    return readLocalWorkspaceState(projectId)
  }

  try {
    const raw = await invokeTauri<string | null>("load_project_workspace_state", { projectId })
    if (!raw) {
      return readLocalWorkspaceState(projectId)
    }
    try {
      return JSON.parse(raw) as WorkspacePersistedState
    } catch {
      return readLocalWorkspaceState(projectId)
    }
  } catch {
    return readLocalWorkspaceState(projectId)
  }
}

export async function saveProjectResumeState(
  projectId: string,
  payload: Pick<ProjectResumeState, "activeMode" | "currentTime" | "activeClipId">,
): Promise<ProjectResumeState> {
  const localBackup = writeLocalResumeState(projectId, payload)
  if (!isTauriRuntime()) {
    return (
      localBackup ?? {
        ...payload,
        updatedAtUnix: Date.now(),
      }
    )
  }

  try {
    return await invokeTauri<ProjectResumeState>("save_project_resume_state", {
      projectId,
      activeMode: payload.activeMode,
      currentTime: payload.currentTime,
      activeClipId: payload.activeClipId ?? null,
    })
  } catch (error) {
    if (localBackup) {
      return localBackup
    }
    throw error
  }
}

export async function loadProjectResumeState(
  projectId: string,
): Promise<ProjectResumeState | null> {
  if (!isTauriRuntime()) {
    return readLocalResumeState(projectId)
  }

  try {
    const fromBackend = await invokeTauri<ProjectResumeState | null>("load_project_resume_state", {
      projectId,
    })
    return fromBackend ?? readLocalResumeState(projectId)
  } catch {
    return readLocalResumeState(projectId)
  }
}

export async function probeYoutubeFormats(
  url: string,
): Promise<YoutubeProbeResult> {
  if (!isTauriRuntime()) {
    return {
      title: "Демо видео YouTube",
      uploader: "Cursed Clipper Demo",
      duration: 192,
      thumbnail: null,
      viewCount: 42_000,
      likeCount: 2_400,
      commentCount: 180,
      uploadDate: "20260120",
      channelId: "demo-channel-id",
      channelUrl: "https://youtube.com/@cursedclipper-demo",
      channelFollowers: 120_000,
      formats: [
        {
          id: "22",
          label: "1280x720 • mp4 • best • 22",
          ext: "mp4",
          resolution: "1280x720",
          fps: 30,
          filesize: 48_000_000,
          vcodec: "avc1",
          acodec: "mp4a",
          audioOnly: false,
          videoOnly: false,
        },
      ],
    }
  }
  return invokeTauri<YoutubeProbeResult>("probe_youtube_formats", { url })
}

export async function downloadYoutubeMedia(
  request: YoutubeDownloadRequest,
): Promise<YoutubeDownloadResult> {
  if (!isTauriRuntime()) {
    return {
      outputPath: "",
      sourceUrl: request.url,
      formatId: request.formatId,
      durationSeconds: null,
    }
  }
  return invokeTauri<YoutubeDownloadResult>("download_youtube_media", {
    request,
  })
}

export async function exportClipsBatch(
  request: ClipBatchExportRequest,
): Promise<ClipBatchExportResult> {
  if (!isTauriRuntime()) {
    return {
      projectDir: "",
      exportedCount: 0,
      artifacts: [],
    }
  }
  return invokeTauri<ClipBatchExportResult>("export_clips_batch", { request })
}
