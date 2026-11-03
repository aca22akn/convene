import { expect, test } from "@playwright/test";

const paths = [
  "/e/demo/stage?mock=1",
  "/e/demo?mock=1",
  "/e/demo/me?mock=1",
  "/e/demo/organiser?mock=1",
  "/c/demo?mock=1",
];

test("security headers are present on pages and API responses", async ({ request }) => {
  const cases = [
    { path: "/", noIndex: false },
    { path: "/e/demo?mock=1", noIndex: true },
    { path: "/api/events", noIndex: true },
    { path: "/c/demo?mock=1", noIndex: true },
    { path: "/this-route-does-not-exist", noIndex: false },
  ];

  for (const item of cases) {
    const response = await request.get(item.path);
    const headers = response.headers();
    expect(headers["strict-transport-security"], item.path).toBe("max-age=31536000");
    expect(headers["referrer-policy"], item.path).toBe("no-referrer");
    expect(headers["x-content-type-options"], item.path).toBe("nosniff");
    expect(headers["x-frame-options"], item.path).toBe("DENY");
    expect(headers["permissions-policy"], item.path).toContain("camera=()");
    expect(headers["permissions-policy"], item.path).toContain("microphone=()");
    if (item.noIndex) expect(headers["x-robots-tag"], item.path).toBe("noindex");
  }

  const notFound = await request.get("/this-route-does-not-exist");
  expect(notFound.status()).toBe(404);
  await expect(notFound.text()).resolves.toContain("We couldn’t find that page.");

  const pageResponse = await request.get("/e/demo/stage?mock=1");
  const csp = pageResponse.headers()["content-security-policy"];
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("nonce-");
  expect(csp).toContain("'unsafe-hashes'");
  expect(csp).toContain("'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='");
  expect(csp).toContain("'sha256-9xjtvxMT1ApHlgn9ohbh2FNfvK5Tqtzy94BjfXBeMSY='");
  expect(csp).toContain("'sha256-jtRRMYY2VbEXuBKbHvqM1/fPT8vazFrEooXdvwUK4y8='");
  expect(csp.match(/style-src ([^;]+)/)?.[1]).not.toContain("'unsafe-inline'");
  expect(csp).toContain("ws://127.0.0.1:54321");
  expect(csp).not.toContain("*.supabase.co");
  expect(csp).not.toContain("localhost:54321");
});

test("the CSP allows the mock pages to run without browser violations", async ({ page }) => {
  const violations: string[] = [];
  let currentPath = "";
  page.on("console", (message) => {
    if (/content security policy|violat(?:ion|ed)|refused to (?:load|execute)/i.test(message.text())) {
      const location = message.location();
      violations.push(`${currentPath} (${location.url}:${location.lineNumber}:${location.columnNumber}) ${message.text()}`);
    }
  });

  for (const path of paths) {
    currentPath = path;
    await page.goto(path);
    await expect(page.locator("body")).not.toBeEmpty();
    const styleAttributes = await page.locator("[style]").evaluateAll((elements) => elements.map((element) => element.outerHTML));
    expect(styleAttributes, path).toEqual([
      '<next-route-announcer style="position: absolute;"></next-route-announcer>',
      '<div aria-live="assertive" id="__next-route-announcer__" role="alert" style="position: absolute; border: 0px; height: 1px; margin: -1px; padding: 0px; width: 1px; clip: rect(0px, 0px, 0px, 0px); overflow: hidden; white-space: nowrap; overflow-wrap: normal;"></div>',
    ]);
  }

  expect(violations).toEqual([]);
});
