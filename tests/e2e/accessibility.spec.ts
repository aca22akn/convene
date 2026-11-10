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

test("stage List view has no accessibility violations", async ({ page }) => {
  await page.goto("/e/demo/stage?mock=1");
  const toggle = page.getByRole("button", { name: "List view" });
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("list", { name: "Introduction list" })).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("closed-doors join mock page has no accessibility violations", async ({ page }) => {
  await page.goto("/e/demo?mock=1&closed=1");
  await expect(page.getByRole("status").filter({ hasText: "The doors are closed" })).toContainText("The doors are closed");

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("room-full join mock page has no accessibility violations", async ({ page }) => {
  await page.route("**/api/e/demo/join", async (route) => {
    await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "room_full" }) });
  });
  await page.goto("/e/demo?mock=1");
  await page.getByRole("textbox", { name: "Name" }).fill("Priya Raman");
  await page.getByRole("textbox", { name: /what are you building/i }).fill("Building a useful tool and looking for design feedback");
  await page.getByRole("button", { name: "Find my people" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "This room is full" })).toContainText("This room is full");

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});
