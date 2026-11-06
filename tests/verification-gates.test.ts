import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/ci.yml", "utf8");

describe("hardening verification gates", () => {
  it("runs every documented Linux verification gate in CI", () => {
    for (const command of ["npm run lint", "npm run typecheck", "npm test", "npm run build", "npm run test:integration", "npm run test:e2e", "npm audit --omit=dev --audit-level=high"]) {
      expect(workflow).toContain(command);
    }
  });

  it("rejects retired Realtime, API query-token, and obsolete privacy text", () => {
    expect(workflow).toMatch(/git grep -n --fixed-strings "postgres_changes" -- app components lib/);
    expect(workflow).toMatch(/git grep -n --fixed-strings "\?token=" -- app\/api/);
    const obsoletePrivacyClaim = ["Nothing", "is sent to anyone"].join(" ");
    expect(workflow).toContain(`git grep -n --fixed-strings "${obsoletePrivacyClaim}" -- README.md app components data docs lib scripts tests`);
  });
});
