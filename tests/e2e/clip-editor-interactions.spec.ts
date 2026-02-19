import { expect, test } from "@playwright/test"

const PROJECT_ID = "p_01"
const WORKSPACE_KEY = `cursed-clipper:workspace:${PROJECT_ID}`
const RESUME_KEY = `cursed-clipper:resume:${PROJECT_ID}`

test("clip operations and timeline undo/redo stay consistent", async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto("/", { waitUntil: "domcontentloaded" })
  await expect(page.getByRole("heading", { name: "Проекты" })).toBeVisible({ timeout: 20_000 })

  await page.evaluate(
    ({ workspaceKey, resumeKey }) => {
      const workspaceState = {
        version: 1,
        media: {
          videoName: "sample.mp4",
          videoUrl: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
          duration: 5,
        },
        transcript: {
          words: [
            { id: "w1", text: "тест", start: 0.4, end: 0.9 },
            { id: "w2", text: "клип", start: 1.0, end: 1.6 },
          ],
          visibleWordCount: 2,
          transcriptBlocks: [],
          selection: null,
        },
        clips: [
          {
            id: "clip_test_1",
            title: "Тест клип",
            start: 1,
            end: 3,
            projectId: "p_01",
          },
        ],
        activeClipId: "clip_test_1",
        semanticBlocks: [],
        ai: {
          viralScore: null,
          viralInsights: [],
          hookCandidates: [],
          contentPlanIdeas: [],
          seriesSegments: [],
          subtitlePresets: [],
          platformPresets: [],
          activeSubtitlePresetId: "",
          selectedPlatformPresetIds: [],
          thumbnailTemplates: [],
          activeThumbnailTemplateId: "",
        },
        exportState: {
          clipDrafts: {},
        },
      }
      const resumeState = {
        activeMode: "clips",
        currentTime: 1,
        activeClipId: "clip_test_1",
        updatedAtUnix: Date.now(),
      }
      window.localStorage.setItem(workspaceKey, JSON.stringify(workspaceState))
      window.localStorage.setItem(resumeKey, JSON.stringify(resumeState))
    },
    { workspaceKey: WORKSPACE_KEY, resumeKey: RESUME_KEY },
  )

  await page.reload({ waitUntil: "domcontentloaded" })
  await expect(page.getByRole("heading", { name: "Проекты" })).toBeVisible({ timeout: 20_000 })
  await page.getByRole("button", { name: "Открыть" }).first().click()

  await expect(page.getByRole("heading", { name: "Сборка клипов" })).toBeVisible({
    timeout: 20_000,
  })
  await expect(page.getByText("0:01 - 0:03").first()).toBeVisible()

  const undoButton = page.getByRole("button", { name: "Отменить" }).first()
  const redoButton = page.getByRole("button", { name: "Повторить" }).first()
  const nudgeRightButton = page.locator('button[title^="Сдвинуть клип вправо"]').first()

  for (let index = 0; index < 6; index += 1) {
    await nudgeRightButton.click()
  }
  await expect(page.getByText("0:02 - 0:04").first()).toBeVisible()

  for (let index = 0; index < 6; index += 1) {
    await undoButton.click()
  }
  await expect(page.getByText("0:01 - 0:03").first()).toBeVisible()

  for (let index = 0; index < 6; index += 1) {
    await redoButton.click()
  }
  await expect(page.getByText("0:02 - 0:04").first()).toBeVisible()
})
