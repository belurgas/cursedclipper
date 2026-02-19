import fs from "node:fs"
import path from "node:path"

const root = process.cwd()
const enPath = path.join(root, "src", "shared", "i18n", "locales", "en", "common.json")
const ruPath = path.join(root, "src", "shared", "i18n", "locales", "ru", "common.json")

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"))

const flattenKeys = (value, prefix = "") => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [prefix]
  }
  const result = []
  for (const key of Object.keys(value)) {
    const nextPrefix = prefix ? `${prefix}.${key}` : key
    result.push(...flattenKeys(value[key], nextPrefix))
  }
  return result
}

const en = readJson(enPath)
const ru = readJson(ruPath)
const enKeys = new Set(flattenKeys(en).filter(Boolean))
const ruKeys = new Set(flattenKeys(ru).filter(Boolean))

const missingInRu = [...enKeys].filter((key) => !ruKeys.has(key))
const missingInEn = [...ruKeys].filter((key) => !enKeys.has(key))

if (missingInRu.length === 0 && missingInEn.length === 0) {
  console.log("i18n catalogs are in sync.")
  process.exit(0)
}

if (missingInRu.length > 0) {
  console.error("Missing keys in ru/common.json:")
  for (const key of missingInRu) {
    console.error(`  - ${key}`)
  }
}
if (missingInEn.length > 0) {
  console.error("Missing keys in en/common.json:")
  for (const key of missingInEn) {
    console.error(`  - ${key}`)
  }
}

process.exit(1)
