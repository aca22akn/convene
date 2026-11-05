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
