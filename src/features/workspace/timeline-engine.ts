import type {
  ClipAssemblyItem,
  ClipAssemblyState,
  ClipAssemblyTrack,
  ClipAssemblyTrackType,
  ClipSegment,
  ExportClipDraft,
} from "@/app/types"

export type TimelineSnapshot = {
  clips: ClipSegment[]
  activeClipId: string | null
  clipDrafts: Record<string, ExportClipDraft>
  assembly: ClipAssemblyState
}

export type TimelineHistory = {
  past: TimelineSnapshot[]
  present: TimelineSnapshot
  future: TimelineSnapshot[]
  revision: number
}

const MAX_HISTORY_ENTRIES = 120
const MIN_CLIP_DURATION_SECONDS = 0.35
const MIN_ASSEMBLY_ITEM_DURATION_SECONDS = 0.2
const MAX_TIMELINE_DURATION_SECONDS = 10 * 60 * 60
const MIN_ASSEMBLY_ZOOM = 0.03
const MAX_ASSEMBLY_ZOOM = 6

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const cloneClip = (clip: ClipSegment): ClipSegment => ({
  ...clip,
  start: Number.isFinite(clip.start)
    ? Math.max(0, Math.min(MAX_TIMELINE_DURATION_SECONDS, clip.start))
    : 0,
  end: Number.isFinite(clip.end)
    ? Math.max(0, Math.min(MAX_TIMELINE_DURATION_SECONDS, clip.end))
    : 0,
})

const normalizeClip = (clip: ClipSegment): ClipSegment => {
  const normalized = cloneClip(clip)
  let start = Math.min(normalized.start, normalized.end)
  let end = Math.max(normalized.start, normalized.end)
  if (end - start < MIN_CLIP_DURATION_SECONDS) {
    if (start + MIN_CLIP_DURATION_SECONDS <= MAX_TIMELINE_DURATION_SECONDS) {
      end = start + MIN_CLIP_DURATION_SECONDS
    } else {
      start = Math.max(0, MAX_TIMELINE_DURATION_SECONDS - MIN_CLIP_DURATION_SECONDS)
      end = MAX_TIMELINE_DURATION_SECONDS
    }
  }
  return {
    ...normalized,
    start,
    end,
  }
}

const buildDefaultAssembly = (clips: ClipSegment[]): ClipAssemblyState => {
  const sortedClips = [...clips].sort((left, right) => {
    if (Math.abs(left.start - right.start) > 0.0001) {
      return left.start - right.start
    }
    if (Math.abs(left.end - right.end) > 0.0001) {
      return left.end - right.end
    }
    return left.id.localeCompare(right.id)
  })
  let timelineCursor = 0
  const items: ClipAssemblyItem[] = sortedClips.map((clip, index) => {
    const clipDuration = Math.max(MIN_CLIP_DURATION_SECONDS, clip.end - clip.start)
    const start = timelineCursor
    const end = start + clipDuration
    timelineCursor = end
    return {
      id: `asm_clip_${clip.id}_${index}`,
      label: clip.title,
      sourceType: "clip",
      sourceClipId: clip.id,
      sourcePath: null,
      timelineStart: start,
      timelineEnd: end,
      sourceIn: clip.start,
      sourceOut: clip.end,
      volume: 1,
      opacity: 1,
      muted: false,
    }
  })
  return {
    tracks: [
      {
        id: "asm_track_video_1",
        name: "V1",
        type: "video",
        muted: false,
        hidden: false,
        locked: false,
        items,
      },
      {
        id: "asm_track_audio_1",
        name: "A1",
        type: "audio",
        muted: false,
        hidden: false,
        locked: false,
        items: [],
      },
    ],
    activeTrackId: "asm_track_video_1",
    activeItemId: items[0]?.id ?? null,
    zoom: 1,
    subtitleOverlaysEnabled: false,
  }
}

const isSourceTypeCompatibleWithTrack = (
  sourceType: ClipAssemblyItem["sourceType"],
  trackType: ClipAssemblyTrackType,
) => {
  if (trackType === "video") {
    return sourceType === "clip" || sourceType === "video-file"
  }
  return sourceType === "audio-file"
}

const normalizeAssemblyTrack = (
  track: ClipAssemblyTrack,
  index: number,
  clipIds: Set<string>,
): ClipAssemblyTrack => {
  const type: ClipAssemblyTrackType = track.type === "audio" ? "audio" : "video"
  const fallbackPrefix = type === "video" ? "V" : "A"
  const fallbackName = `${fallbackPrefix}${index + 1}`
  const normalizedItems = Array.isArray(track.items)
    ? track.items
        .map((item, itemIndex) => {
          const normalizedSourceType: ClipAssemblyItem["sourceType"] =
            item.sourceType === "audio-file" ||
            item.sourceType === "video-file" ||
            item.sourceType === "clip"
              ? item.sourceType
              : type === "audio"
                ? "audio-file"
                : "clip"
          if (!isSourceTypeCompatibleWithTrack(normalizedSourceType, type)) {
            return null
          }

          const sourceClipId =
            typeof item.sourceClipId === "string" && item.sourceClipId.trim()
              ? item.sourceClipId
              : null
          if (normalizedSourceType === "clip") {
            if (!sourceClipId || !clipIds.has(sourceClipId)) {
              return null
            }
          }

          const normalizedStart = Number.isFinite(item.timelineStart) ? item.timelineStart : 0
          const rawEnd = Number.isFinite(item.timelineEnd) ? item.timelineEnd : normalizedStart
          const start = clamp(Math.min(normalizedStart, rawEnd), 0, MAX_TIMELINE_DURATION_SECONDS)
          const minEnd = Math.min(
            MAX_TIMELINE_DURATION_SECONDS,
            start + MIN_ASSEMBLY_ITEM_DURATION_SECONDS,
          )
          const end = clamp(Math.max(normalizedStart, rawEnd), minEnd, MAX_TIMELINE_DURATION_SECONDS)
          const sourceIn = clamp(
            Number.isFinite(item.sourceIn) ? item.sourceIn : 0,
            0,
            MAX_TIMELINE_DURATION_SECONDS,
          )
          const sourceOut = clamp(
            Number.isFinite(item.sourceOut) ? item.sourceOut : sourceIn + (end - start),
            sourceIn,
            MAX_TIMELINE_DURATION_SECONDS,
          )

          return {
            id:
              typeof item.id === "string" && item.id.trim()
                ? item.id
                : `asm_item_${type}_${index}_${itemIndex}`,
            label:
              typeof item.label === "string" && item.label.trim()
                ? item.label
                : normalizedSourceType === "clip"
                  ? "Clip"
                  : normalizedSourceType === "audio-file"
                    ? "Audio"
                    : "Video",
            sourceType: normalizedSourceType,
            sourceClipId: normalizedSourceType === "clip" ? sourceClipId : null,
            sourcePath:
              typeof item.sourcePath === "string" && item.sourcePath.trim()
                ? item.sourcePath
                : null,
            timelineStart: start,
            timelineEnd: end,
            sourceIn,
            sourceOut,
            volume: clamp(
              Number.isFinite(item.volume) ? item.volume : 1,
              0,
              2,
            ),
            opacity: clamp(
              Number.isFinite(item.opacity) ? item.opacity : 1,
              0,
              1,
            ),
            muted: Boolean(item.muted),
          }
        })
        .filter((item): item is ClipAssemblyItem => Boolean(item))
        .sort((left, right) => {
          if (Math.abs(left.timelineStart - right.timelineStart) > 0.0001) {
            return left.timelineStart - right.timelineStart
          }
          if (Math.abs(left.timelineEnd - right.timelineEnd) > 0.0001) {
            return left.timelineEnd - right.timelineEnd
          }
          return left.id.localeCompare(right.id)
        })
        .reduce<ClipAssemblyItem[]>((acc, item) => {
          const previous = acc[acc.length - 1] ?? null
          if (!previous) {
            acc.push(item)
            return acc
          }
          const requestedDuration = Math.max(
            MIN_ASSEMBLY_ITEM_DURATION_SECONDS,
            item.timelineEnd - item.timelineStart,
          )
          const nextStart = clamp(
            Math.max(item.timelineStart, previous.timelineEnd),
            0,
            MAX_TIMELINE_DURATION_SECONDS - MIN_ASSEMBLY_ITEM_DURATION_SECONDS,
          )
          const nextEnd = clamp(
            nextStart + requestedDuration,
            nextStart + MIN_ASSEMBLY_ITEM_DURATION_SECONDS,
            MAX_TIMELINE_DURATION_SECONDS,
          )
          acc.push({
            ...item,
            timelineStart: nextStart,
            timelineEnd: nextEnd,
          })
          return acc
        }, [])
    : []

  return {
    id:
      typeof track.id === "string" && track.id.trim()
        ? track.id
        : `asm_track_${type}_${index + 1}`,
    name:
      typeof track.name === "string" && track.name.trim() ? track.name : fallbackName,
    type,
    muted: Boolean(track.muted),
    hidden: Boolean(track.hidden),
    locked: Boolean(track.locked),
    items: normalizedItems,
  }
}

const normalizeAssemblyState = (
  assembly: ClipAssemblyState | undefined,
  clips: ClipSegment[],
): ClipAssemblyState => {
  if (!assembly || !Array.isArray(assembly.tracks)) {
    return buildDefaultAssembly(clips)
  }
  const clipIdSet = new Set(clips.map((clip) => clip.id))
  const seenTrackIds = new Set<string>()
  const normalizedTracks: ClipAssemblyTrack[] = []
  for (let index = 0; index < assembly.tracks.length; index += 1) {
    const rawTrack = assembly.tracks[index]
    if (!rawTrack || typeof rawTrack !== "object") {
      continue
    }
    const normalizedTrack = normalizeAssemblyTrack(
      rawTrack as ClipAssemblyTrack,
      index,
      clipIdSet,
    )
    let trackId = normalizedTrack.id
    if (seenTrackIds.has(trackId)) {
      trackId = `${trackId}_${index + 1}`
    }
    seenTrackIds.add(trackId)
    normalizedTracks.push({
      ...normalizedTrack,
      id: trackId,
    })
  }

  const hasVideoTrack = normalizedTracks.some((track) => track.type === "video")
  const hasAudioTrack = normalizedTracks.some((track) => track.type === "audio")
  if (!hasVideoTrack) {
    normalizedTracks.unshift({
      id: "asm_track_video_fallback",
      name: "V1",
      type: "video",
      muted: false,
      hidden: false,
      locked: false,
      items: [],
    })
  }
  if (!hasAudioTrack) {
    normalizedTracks.push({
      id: "asm_track_audio_fallback",
      name: "A1",
      type: "audio",
      muted: false,
      hidden: false,
      locked: false,
      items: [],
    })
  }

  const orderedTracks = [
    ...normalizedTracks.filter((track) => track.type === "video"),
    ...normalizedTracks.filter((track) => track.type === "audio"),
  ]
  const allTrackIds = new Set(orderedTracks.map((track) => track.id))
  const allItemIds = new Set(orderedTracks.flatMap((track) => track.items.map((item) => item.id)))
  const fallbackTrack =
    orderedTracks.find((track) => track.type === "video") ?? orderedTracks[0] ?? null
  const fallbackItem = fallbackTrack?.items[0] ?? orderedTracks.flatMap((track) => track.items)[0] ?? null

  return {
    tracks: orderedTracks,
    activeTrackId:
      typeof assembly.activeTrackId === "string" && allTrackIds.has(assembly.activeTrackId)
        ? assembly.activeTrackId
        : fallbackTrack?.id ?? null,
    activeItemId:
      typeof assembly.activeItemId === "string" && allItemIds.has(assembly.activeItemId)
        ? assembly.activeItemId
        : fallbackItem?.id ?? null,
    zoom: clamp(
      Number.isFinite(assembly.zoom) ? assembly.zoom : 1,
      MIN_ASSEMBLY_ZOOM,
      MAX_ASSEMBLY_ZOOM,
    ),
    subtitleOverlaysEnabled:
      typeof (assembly as { subtitleOverlaysEnabled?: unknown }).subtitleOverlaysEnabled === "boolean"
        ? Boolean((assembly as { subtitleOverlaysEnabled: boolean }).subtitleOverlaysEnabled)
        : false,
  }
}

const normalizeSnapshot = (snapshot: TimelineSnapshot): TimelineSnapshot => {
  const clips = snapshot.clips
    .map(normalizeClip)
    .sort((left, right) => {
      if (Math.abs(left.start - right.start) > 0.0001) {
        return left.start - right.start
      }
      if (Math.abs(left.end - right.end) > 0.0001) {
        return left.end - right.end
      }
      return left.id.localeCompare(right.id)
    })
  const activeExists = clips.some((clip) => clip.id === snapshot.activeClipId)
  const clipIdSet = new Set(clips.map((clip) => clip.id))
  const sourceClipDrafts = snapshot.clipDrafts ?? {}
  let hasStaleDrafts = false
  for (const clipId of Object.keys(sourceClipDrafts)) {
    if (!clipIdSet.has(clipId)) {
      hasStaleDrafts = true
      break
    }
  }
  const clipDrafts = hasStaleDrafts
    ? (Object.fromEntries(
        Object.entries(sourceClipDrafts).filter(([clipId]) => clipIdSet.has(clipId)),
      ) as Record<string, ExportClipDraft>)
    : sourceClipDrafts
  const assembly = normalizeAssemblyState(snapshot.assembly, clips)
  return {
    clips,
    activeClipId: activeExists ? snapshot.activeClipId : clips[0]?.id ?? null,
    clipDrafts,
    assembly,
  }
}

const sortRecordDeep = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortRecordDeep)
  }
  if (!value || typeof value !== "object") {
    return value
  }
  const record = value as Record<string, unknown>
  const sortedKeys = Object.keys(record).sort((left, right) => left.localeCompare(right))
  const sorted: Record<string, unknown> = {}
  for (const key of sortedKeys) {
    sorted[key] = sortRecordDeep(record[key])
  }
  return sorted
}

const areSnapshotsEqual = (left: TimelineSnapshot, right: TimelineSnapshot): boolean => {
  if (left.activeClipId !== right.activeClipId) {
    return false
  }
  if (left.clips.length !== right.clips.length) {
    return false
  }
  for (let index = 0; index < left.clips.length; index += 1) {
    const leftClip = left.clips[index]
    const rightClip = right.clips[index]
    if (!leftClip || !rightClip) {
      return false
    }
    if (
      leftClip.id !== rightClip.id ||
      leftClip.title !== rightClip.title ||
      leftClip.projectId !== rightClip.projectId ||
      Math.abs(leftClip.start - rightClip.start) > 0.0001 ||
      Math.abs(leftClip.end - rightClip.end) > 0.0001
    ) {
      return false
    }
  }
  if (left.clipDrafts !== right.clipDrafts) {
    const leftDraftKeys = Object.keys(left.clipDrafts)
    const rightDraftKeys = Object.keys(right.clipDrafts)
    if (leftDraftKeys.length !== rightDraftKeys.length) {
      return false
    }
    let allDraftReferencesMatch = true
    for (const key of leftDraftKeys) {
      if (!(key in right.clipDrafts)) {
        return false
      }
      if (left.clipDrafts[key] !== right.clipDrafts[key]) {
        allDraftReferencesMatch = false
      }
    }
    if (
      !allDraftReferencesMatch &&
      JSON.stringify(sortRecordDeep(left.clipDrafts)) !==
        JSON.stringify(sortRecordDeep(right.clipDrafts))
    ) {
      return false
    }
  }

  if (left.assembly === right.assembly) {
    return true
  }
  return (
    JSON.stringify(sortRecordDeep(left.assembly)) ===
    JSON.stringify(sortRecordDeep(right.assembly))
  )
}

export const createTimelineHistory = (
  initial?: Partial<TimelineSnapshot>,
): TimelineHistory => {
  const present = normalizeSnapshot({
    clips: initial?.clips ?? [],
    activeClipId: initial?.activeClipId ?? null,
    clipDrafts: initial?.clipDrafts ?? {},
    assembly: initial?.assembly ?? buildDefaultAssembly(initial?.clips ?? []),
  })
  return {
    past: [],
    present,
    future: [],
    revision: 0,
  }
}

export const replaceTimelineSnapshot = (
  history: TimelineHistory,
  snapshot: TimelineSnapshot,
): TimelineHistory => {
  const normalized = normalizeSnapshot(snapshot)
  if (areSnapshotsEqual(history.present, normalized)) {
    return history
  }
  return {
    ...history,
    present: normalized,
    future: [],
    revision: history.revision + 1,
  }
}

export const updateTimelineHistory = (
  history: TimelineHistory,
  updater: (snapshot: TimelineSnapshot) => TimelineSnapshot,
  options?: {
    recordHistory?: boolean
    maxHistoryEntries?: number
  },
): TimelineHistory => {
  const nextRaw = updater(history.present)
  const next = normalizeSnapshot(nextRaw)
  if (areSnapshotsEqual(history.present, next)) {
    return history
  }

  const recordHistory = options?.recordHistory ?? true
  if (!recordHistory) {
    return {
      ...history,
      present: next,
      future: [],
      revision: history.revision + 1,
    }
  }

  const maxEntries = Math.max(10, options?.maxHistoryEntries ?? MAX_HISTORY_ENTRIES)
  const past = [...history.past, history.present]
  const trimmedPast = past.length > maxEntries ? past.slice(past.length - maxEntries) : past
  return {
    past: trimmedPast,
    present: next,
    future: [],
    revision: history.revision + 1,
  }
}

export const undoTimelineHistory = (history: TimelineHistory): TimelineHistory => {
  if (history.past.length === 0) {
    return history
  }
  const previous = history.past[history.past.length - 1]
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
    revision: history.revision + 1,
  }
}

export const redoTimelineHistory = (history: TimelineHistory): TimelineHistory => {
  if (history.future.length === 0) {
    return history
  }
  const next = history.future[0]
  return {
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1),
    revision: history.revision + 1,
  }
}
