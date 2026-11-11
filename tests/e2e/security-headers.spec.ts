import { expect, test } from "@playwright/test";

type CspViolation = {
  blockedURI: string;
  violatedDirective: string;
  effectiveDirective: string;
  sourceFile: string;
  lineNumber: number;
};

declare global {
  interface Window {
    __cspViolations: CspViolation[];
  }
}

const mockPages = [
  { path: "/e/demo/stage?mock=1", heading: "Scan to meet the right people here" },
  { path: "/e/demo?mock=1", heading: "Who should you meet here?" },
  { path: "/e/demo/me?mock=1", heading: "Your intros" },
  { path: "/e/demo/organiser?mock=1", heading: "Sample event" },
  { path: "/c/demo?mock=1", heading: "Sample community" },
];

test.describe.configure({ retries: 0 });

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

test("the CSP allows the mock pages to run without browser violations", async ({ page, request }) => {
  const consoleViolations: string[] = [];
  let currentPath = "";
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      window.__cspViolations.push({
        blockedURI: event.blockedURI,
        violatedDirective: event.violatedDirective,
        effectiveDirective: event.effectiveDirective,
        sourceFile: event.sourceFile,
        lineNumber: event.lineNumber,
      });
    });
  });
  page.on("console", (message) => {
    if (/content security policy|violat(?:ion|ed)|refused to (?:load|execute)/i.test(message.text())) {
      const location = message.location();
      consoleViolations.push(`${currentPath} (${location.url}:${location.lineNumber}:${location.columnNumber}) ${message.text()}`);
    }
  });

  for (const { path, heading } of mockPages) {
    const htmlResponse = await request.get(path);
    expect(htmlResponse.ok(), path).toBeTruthy();
    const html = await htmlResponse.text();
    const styleTags = [...html.matchAll(/<([a-z][\w:-]*)\b[^>]*\sstyle=(?:"[^"]*"|'[^']*')[^>]*>/gi)].map((match) => ({
      name: match[1].toLowerCase(),
      tag: match[0],
    }));
    // Route announcers are client-injected, so server HTML should have zero style attributes; unexpected ones are a CSP regression.
    const unexpectedStyleTags = styleTags.filter(({ name, tag }) =>
      !(name === "next-route-announcer" || (name === "div" && /\bid="__next-route-announcer__"/.test(tag))));
    expect(unexpectedStyleTags, path).toEqual([]);

    currentPath = path;
    await page.goto(path, { waitUntil: "load" });
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();

    const cspViolations = await page.evaluate(() => window.__cspViolations);
    expect(cspViolations, path).toEqual([]);
  }

  expect(consoleViolations).toEqual([]);
});
