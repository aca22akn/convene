import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("sample stage renders and its content is inside a landmark", async ({ page }) => {
  await page.goto("/e/demo/stage?mock=1");

  await expect(page).toHaveTitle("Convene");
  await expect(page.getByRole("heading", { name: "Scan to meet the right people here" })).toBeVisible();
  await expect(page.getByText("Sample event")).toBeVisible();
  await expect(page.getByRole("article", { name: "Latest intro" })).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).withRules(["region"]).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("stage exposes every introduction in a keyboard-operated list", async ({ page }) => {
  await page.goto("/e/demo/stage?mock=1");

  const toggle = page.getByRole("button", { name: "All intros (5)" });
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");

  const list = page.getByRole("list", { name: "Introduction list" });
  await expect(list).toBeVisible();
  await expect(list.getByRole("listitem")).toHaveCount(5);
  await expect(list).toContainText("Introduction 5");
  await expect(list).toContainText("Introduction 1");
  await list.getByRole("listitem").last().scrollIntoViewIfNeeded();
  await expect(list.getByRole("listitem").last()).toBeInViewport();
});

for (const [width, height] of [[1280, 720], [1366, 768], [1920, 1080]] as const) {
  test(`stage fits ${width}×${height} without scrolling and keeps the essentials on screen`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    await page.goto("/e/demo/stage?mock=1");

    const latest = page.getByRole("article", { name: "Latest intro" });
    await expect(latest).toBeVisible();
    const size = await page.evaluate(() => ({ scroll: document.documentElement.scrollHeight, inner: window.innerHeight, scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth }));
    expect(size.scroll).toBeLessThanOrEqual(size.inner);
    expect(size.scrollW).toBeLessThanOrEqual(size.innerW);

    for (const locator of [
      page.getByRole("img", { name: /QR code to join/ }),
      latest,
      page.getByRole("list", { name: "Earlier intros" }),
      page.getByRole("list", { name: "Who’s here" }),
    ]) await expect(locator).toBeInViewport({ ratio: 1 });

    // Readable from the back of the room: the featured quote is at least ~28px even at 1280×720.
    const quoteSize = await latest.locator("p").nth(1).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(quoteSize).toBeGreaterThanOrEqual(28);
    await page.screenshot({ path: testInfo.outputPath(`stage-${width}x${height}.png`) });
  });
}
