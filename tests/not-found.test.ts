import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Next 16 request-time not-found route", () => {
  it("allows the root layout's connection() call to block prerendering", () => {
    const source = readFileSync(path.join(process.cwd(), "app", "not-found.tsx"), "utf8");
    expect(source).toMatch(/export const instant = false/);
  });
});
