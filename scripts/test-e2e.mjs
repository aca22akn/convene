import { cpSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { copyNodeModules } from "./copy-node-modules.mjs";
import { createIsolatedTestEnv } from "./test-env.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tempRoot = mkdtempSync(path.join(os.tmpdir(), "convene-e2e-"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

const env = createIsolatedTestEnv(process.env, tempRoot, {
  NPM_CONFIG_USERCONFIG: path.join(tempRoot, ".npmrc"),
  NPM_CONFIG_GLOBALCONFIG: path.join(tempRoot, "npm-globalrc"),
  NPM_CONFIG_CACHE: path.join(tempRoot, ".npm-cache"),
  PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH ?? path.join(os.tmpdir(), "convene-playwright-browsers"),
  NEXT_TELEMETRY_DISABLED: "1",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "playwright-placeholder-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "playwright-placeholder-service-role-key",
  PUBLIC_ID_SECRET: "playwright-placeholder-public-id-secret",
  AI_API_KEY: "",
  XAI_API_KEY: "",
  PERSON_KEY_PEPPER: "playwright-placeholder-person-key-pepper",
  CRON_SECRET: "playwright-placeholder-cron-secret",
  NEXT_PUBLIC_BASE_URL: "http://127.0.0.1:3173",
  MAX_MEMBERS_PER_EVENT: "200",
  AI_DAILY_CALL_LIMIT: "3000",
  RETENTION_DAYS: "365",
});

function excludedFromTestCopy(source) {
  const relative = path.relative(root, source);
  if (!relative) return false;
  return relative.split(path.sep).some((segment) =>
    segment === ".git" ||
    segment === ".next" ||
    segment === ".vercel" ||
    segment === "node_modules" ||
    segment === "test-results" ||
    segment === "playwright-report" ||
    segment === ".supabase-home" ||
    segment === ".temp" ||
    segment === ".npmrc" ||
    segment.startsWith(".env"),
  );
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: tempRoot,
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status ?? "unknown"}`);
}

let passed = false;
try {
  cpSync(root, tempRoot, { recursive: true, filter: (source) => !excludedFromTestCopy(source) });
  // Keep relative .bin symlinks relative so the temp workspace uses its copied dependencies.
  copyNodeModules(path.join(root, "node_modules"), path.join(tempRoot, "node_modules"));

  run(npm, ["run", "build"]);
  run(npx, ["playwright", "test"]);
  passed = true;
} finally {
  const tempDirectory = path.resolve(os.tmpdir());
  const testDirectory = path.resolve(tempRoot);
  if (passed && path.dirname(testDirectory) === tempDirectory && path.basename(testDirectory).startsWith("convene-e2e-")) {
    rmSync(testDirectory, { recursive: true, force: true });
  } else if (!passed) {
    process.stderr.write(`E2E workspace retained for inspection: ${testRootLabel(tempRoot)}\n`);
  }
}

function testRootLabel(value) {
  return path.resolve(value);
}
