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

test("stage All intros list has no accessibility violations", async ({ page }) => {
  await page.goto("/e/demo/stage?mock=1");
  const toggle = page.getByRole("button", { name: "All intros (5)" });
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
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Find my intros" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "This room is full" })).toContainText("This room is full");

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("each step of the stepped join flow has no accessibility violations", async ({ page }) => {
  await page.goto("/e/demo?mock=1");
  await expect(page.getByRole("heading", { name: "Your line" })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  // Validation errors are part of the flow too.
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Enter your name.")).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await page.getByRole("textbox", { name: "Name" }).fill("Priya Raman");
  await page.getByRole("textbox", { name: /what are you building/i }).fill("Building a useful tool and looking for design feedback");
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("heading", { name: "A little more" })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("heading", { name: "Your choices" })).toBeVisible();
  await page.getByRole("checkbox", { name: /share my contact/i }).check();
  await expect(page.getByRole("textbox", { name: "Phone or email" })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("honest finding-your-intros and empty states have no accessibility violations", async ({ page }) => {
  await page.route("**/api/e/demo/me**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ event: { id: "e", member_count: 1 }, member: { id: "x", name: "Priya Raman", line: "Building a carbon API, need a Postgres engineer" }, matches: [] }),
    }));
  await page.goto("/e/demo/me?id=x&joined=1");
  await expect(page.getByRole("status", { name: "Loading your intros" })).toContainText("Finding your intros");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await page.goto("/e/demo/me?id=x");
  await expect(page.getByText("No intros yet")).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("intros load-failure state has no accessibility violations", async ({ page }) => {
  await page.route("**/api/e/demo/me**", (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "server error" }) }));
  await page.goto("/e/demo/me?id=x");
  await expect(page.getByRole("alert").filter({ hasText: "We couldn’t load your intros" })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
