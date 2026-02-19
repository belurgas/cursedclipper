import { expect, test } from "@playwright/test"

test("create project via YouTube probe flow", async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto("/", { waitUntil: "domcontentloaded" })
  await expect(page.getByRole("heading", { name: "Проекты" })).toBeVisible({ timeout: 20_000 })

  const createButton = page.getByRole("button", { name: "Создать проект" })
  await expect(createButton).toBeVisible({ timeout: 20_000 })
  await createButton.click()

  await page.getByRole("button", { name: "Ссылка YouTube" }).click()
  await page.getByPlaceholder("https://www.youtube.com/watch?v=...").fill(
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  )
  await page.getByRole("button", { name: "Проверить форматы" }).click()

  await expect(page.getByText("Демо видео YouTube")).toBeVisible({ timeout: 10_000 })

  const projectName = `E2E Project ${Date.now()}`
  await page.getByLabel("Название проекта").fill(projectName)
  await page.getByLabel("Бриф").fill(
    "Авто-тест: проверка создания проекта через YouTube-поток и открытия карточки в дашборде.",
  )

  await page.getByRole("button", { name: "Создать проект" }).click()
  await expect(page.getByText(projectName)).toBeVisible({ timeout: 10_000 })
})
