import { invoke } from "@tauri-apps/api/core"
import { getCurrentWindow } from "@tauri-apps/api/window"

type CommandArgs = Record<string, unknown>

export function isTauriRuntime(): boolean {
  if (typeof window === "undefined") {
    return false
  }
  const runtime = window as unknown as Record<string, unknown>
  return "__TAURI_INTERNALS__" in runtime || "__TAURI__" in runtime
}

export async function invokeTauri<T>(
  command: string,
  args?: CommandArgs,
): Promise<T> {
  return invoke<T>(command, args)
}

export function getTauriWindow() {
  return isTauriRuntime() ? getCurrentWindow() : null
}
