import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { copyNodeModules } from "../scripts/copy-node-modules.mjs";
import { createIsolatedTestEnv, sanitizeTestDiagnostic } from "../scripts/test-env.mjs";

const e2eRunner = readFileSync(path.join(process.cwd(), "scripts", "test-e2e.mjs"), "utf8");
const nodeModulesCopier = readFileSync(path.join(process.cwd(), "scripts", "copy-node-modules.mjs"), "utf8");
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
    expect(e2eRunner).toContain("copyNodeModules(path.join(root, \"node_modules\")");
    expect(nodeModulesCopier).toContain("verbatimSymlinks: true");
  });

  it("keeps copied .bin symlinks inside the E2E temp root", (context) => {
    const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), "convene-e2e-copy-"));
    const sourceNodeModules = path.join(fixtureRoot, "source", "node_modules");
    const tempRoot = path.join(fixtureRoot, "temp");
    const copiedNodeModules = path.join(tempRoot, "node_modules");
    const sourceBin = path.join(sourceNodeModules, ".bin");
    const sourceExecutable = path.join(sourceNodeModules, "next", "dist", "bin", "next");
    const linkPath = path.join(sourceBin, "next");

    try {
      mkdirSync(path.dirname(sourceExecutable), { recursive: true });
      mkdirSync(sourceBin, { recursive: true });
      writeFileSync(sourceExecutable, "fixture");

      try {
        symlinkSync("../next/dist/bin/next", linkPath, "file");
      } catch (error) {
        const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
        if (process.platform === "win32" && ["EPERM", "EACCES", "ENOTSUP", "UNKNOWN"].includes(code)) {
          context.skip("This Windows environment does not allow creating symbolic links.");
        }
        throw error;
      }

      copyNodeModules(sourceNodeModules, copiedNodeModules);

      const copiedBin = path.join(copiedNodeModules, ".bin");
      const copiedEntries = readdirSync(copiedBin);
      expect(copiedEntries.length).toBeGreaterThan(0);

      let checkedSymlinks = 0;
      for (const entry of copiedEntries) {
        const copiedEntry = path.join(copiedBin, entry);
        if (!lstatSync(copiedEntry).isSymbolicLink()) continue;

        checkedSymlinks += 1;
        const resolvedTarget = realpathSync(copiedEntry);
        const relativeTarget = path.relative(tempRoot, resolvedTarget);
        expect(relativeTarget === ".." || relativeTarget.startsWith(`..${path.sep}`) || path.isAbsolute(relativeTarget)).toBe(false);
      }
      expect(checkedSymlinks).toBeGreaterThan(0);
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
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
