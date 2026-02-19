import i18n from "i18next"
import { initReactI18next } from "react-i18next"

import { getStoredUiLanguage, normalizeUiLanguage } from "@/shared/i18n/language"
import enCommon from "@/shared/i18n/locales/en/common.json"
import ruCommon from "@/shared/i18n/locales/ru/common.json"

const initialLanguage = normalizeUiLanguage(getStoredUiLanguage())

void i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: enCommon },
      ru: { common: ruCommon },
    },
    lng: initialLanguage,
    fallbackLng: "en",
    supportedLngs: ["en", "ru"],
    defaultNS: "common",
    interpolation: {
      escapeValue: false,
    },
    returnNull: false,
  })

export default i18n
