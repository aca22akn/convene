import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const mockPages = [
  ["join", "/e/demo?mock=1"],
  ["stage", "/e/demo/stage?mock=1"],
  ["matches", "/e/demo/me?mock=1"],
  ["organiser", "/e/demo/organiser?mock=1"],
  ["directory", "/c/demo?mock=1"],
  ["create event", "/"],
] as const;

for (const [name, url] of mockPages) {
  test(`${name} mock page has no accessibility violations`, async ({ page }) => {
    await page.goto(url);
    await expect(page.getByRole("main")).toBeVisible();

    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(accessibility.violations).toEqual([]);
  });
}
