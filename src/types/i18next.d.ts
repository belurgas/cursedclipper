import "i18next"

import commonEn from "@/shared/i18n/locales/en/common.json"

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common"
    resources: {
      common: typeof commonEn
    }
    returnNull: false
    allowObjectInHTMLChildren: false
  }
}
