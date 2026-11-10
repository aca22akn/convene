import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("demo stage renders and its content is inside a landmark", async ({ page }) => {
  await page.goto("/e/demo/stage?mock=1");

  await expect(page).toHaveTitle("Convene");
  await expect(page.getByRole("heading", { name: "Scan to meet the right people here" })).toBeVisible();
  await expect(page.getByText("Demo night")).toBeVisible();
  await expect(page.locator(".force-graph-container canvas")).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).withRules(["region"]).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("stage exposes every introduction in a keyboard-operated list view", async ({ page }) => {
  await page.goto("/e/demo/stage?mock=1");

  const toggle = page.getByRole("button", { name: "List view" });
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");

  const list = page.getByRole("list", { name: "Introduction list" });
  await expect(list).toBeVisible();
  await expect(list.getByRole("listitem")).toHaveCount(5);
  await expect(list).toContainText("Introduction 5");
});

for (const [width, height] of [[1366, 768], [1920, 1080]] as const) {
  test(`stage keeps five long introductions reachable at ${width}×${height}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    await page.goto("/e/demo/stage?mock=1");

    const list = page.getByRole("list", { name: "Latest introductions" });
    await expect(list).toBeVisible();
    await expect(list.getByRole("listitem")).toHaveCount(5);
    await expect(page.getByText("2 more below")).toBeVisible();

    const entries = list.getByRole("listitem");
    const lastEntry = entries.last();
    await lastEntry.scrollIntoViewIfNeeded();
    await expect(lastEntry).toBeInViewport();
    await expect(lastEntry.locator("[title]")).toHaveAttribute("title", /Introduction 1/);
    await page.screenshot({ path: testInfo.outputPath(`stage-overflow-${width}x${height}.png`), fullPage: true });
  });
}
