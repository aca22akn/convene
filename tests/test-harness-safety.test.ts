import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createIsolatedTestEnv, sanitizeTestDiagnostic } from "../scripts/test-env.mjs";

const e2eRunner = readFileSync(path.join(process.cwd(), "scripts", "test-e2e.mjs"), "utf8");
const integrationRunner = readFileSync(path.join(process.cwd(), "scripts", "test-integration.mjs"), "utf8");

describe("test harness isolation", () => {
  it("does not pass the complete ambient environment to child processes", () => {
    expect(e2eRunner).not.toContain("...process.env");
    expect(integrationRunner).not.toContain("...process.env");
  });

  it("excludes Supabase local metadata from retained E2E workspaces", () => {
    expect(e2eRunner).toMatch(/segment === ["']\.temp["']/);
  });

  it("copies the workspace root into the E2E temp directory", () => {
    expect(e2eRunner).toMatch(/if\s*\(!relative\)\s*return false;/);
  });

  it("keeps dependencies inside the Turbopack workspace", () => {
    expect(e2eRunner).toMatch(/cpSync\(path\.join\(root, ["']node_modules["']\),/);
    expect(e2eRunner).not.toContain("symlinkSync");
  });

  it("keeps credentials out of isolated child environments", () => {
    expect(createIsolatedTestEnv({
      PATH: "C:\\node",
      SUPABASE_ACCESS_TOKEN: "must-not-pass",
      AWS_SECRET_ACCESS_KEY: "must-not-pass",
      NPM_TOKEN: "must-not-pass",
      PLAYWRIGHT_BROWSERS_PATH: "C:\\browser-cache",
    }, "C:\\isolated-home", { TEST_VALUE: "allowed override" })).toEqual({
      PATH: "C:\\node",
      PLAYWRIGHT_BROWSERS_PATH: "C:\\browser-cache",
      HOME: "C:\\isolated-home",
      USERPROFILE: "C:\\isolated-home",
      APPDATA: "C:\\isolated-home",
      LOCALAPPDATA: "C:\\isolated-home",
      TEST_VALUE: "allowed override",
    });
  });

  it("redacts local keys and bearer tokens from CLI diagnostics", () => {
    expect(sanitizeTestDiagnostic("SERVICE_ROLE_KEY=local-secret\nservice_role key: local-secret\nBearer abc.def\neyJabcdefghijk.abcdefghijk.abcdefghijk\nsb_secret_1234567890abcdefghij"))
      .toBe("SERVICE_ROLE_KEY=[redacted]\nservice_role key: [redacted]\nBearer [redacted]\n[redacted JWT]\n[redacted Supabase key]");
  });
});
