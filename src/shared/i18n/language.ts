export type UiLanguage = "en" | "ru"

const STORAGE_KEY = "cursed-clipper:ui-language"

export function normalizeUiLanguage(value: unknown): UiLanguage {
  return value === "ru" ? "ru" : "en"
}

export function getStoredUiLanguage(): UiLanguage {
  if (typeof window === "undefined") {
    return "en"
  }
  try {
    return normalizeUiLanguage(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    return "en"
  }
}

export function hasStoredUiLanguage(): boolean {
  if (typeof window === "undefined") {
    return false
  }
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== null
  } catch {
    return false
  }
}

export function setStoredUiLanguage(language: UiLanguage) {
  if (typeof window === "undefined") {
    return
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, normalizeUiLanguage(language))
  } catch {
    // no-op
  }
}

export function resolveIntlLocale(language: UiLanguage): string {
  return language === "ru" ? "ru-RU" : "en-US"
}
