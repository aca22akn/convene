import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createIsolatedTestEnv, sanitizeTestDiagnostic } from "./test-env.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

function run(command, args, env, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    encoding: options.capture ? "utf8" : undefined,
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  return result;
}

function parseStatusEnv(output) {
  const values = new Map();
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match) continue;
    const raw = match[2].trim();
    values.set(match[1], raw.replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, (_whole, doubleQuoted, singleQuoted) => doubleQuoted ?? singleQuoted));
  }
  return values;
}

function isLoopback(value) {
  try {
    return ["127.0.0.1", "localhost", "::1"].includes(new URL(value).hostname);
  } catch {
    return false;
  }
}

function main() {
  const isolatedHome = mkdtempSync(path.join(os.tmpdir(), "convene-integration-home-"));
  try {
    const supabaseHome = path.join(root, ".supabase-home");
    const cliEnv = createIsolatedTestEnv(process.env, isolatedHome, {
      NPM_CONFIG_USERCONFIG: path.join(isolatedHome, ".npmrc"),
      NPM_CONFIG_GLOBALCONFIG: path.join(isolatedHome, "npm-globalrc"),
      NPM_CONFIG_CACHE: path.join(isolatedHome, ".npm-cache"),
      SUPABASE_TELEMETRY_DISABLED: "1",
      SUPABASE_HOME: supabaseHome,
    });

    const status = run(npx, ["supabase", "status", "--output", "env"], cliEnv, { capture: true });
    if (status.status !== 0) {
      const diagnostic = sanitizeTestDiagnostic(status.stderr ?? "").trim();
      if (diagnostic) process.stderr.write(`Supabase CLI diagnostic:\n${diagnostic.slice(0, 4000)}\n`);
      process.stderr.write("Local Supabase is not running. Start it with `npx supabase start` before integration tests.\n");
      return status.status ?? 1;
    }
    const values = parseStatusEnv(status.stdout ?? "");

    const apiUrl = values.get("API_URL");
    if (!apiUrl || !isLoopback(apiUrl)) {
      process.stderr.write("Integration tests only run against a loopback Supabase API URL.\n");
      return 1;
    }

    const anonKey = values.get("ANON_KEY");
    const serviceRoleKey = values.get("SERVICE_ROLE_KEY");
    if (!anonKey || !serviceRoleKey) {
      process.stderr.write("Local Supabase did not provide the anon and service-role keys required for integration tests.\n");
      return 1;
    }

    const testEnv = {
      ...cliEnv,
      API_URL: apiUrl,
      ANON_KEY: anonKey,
      SERVICE_ROLE_KEY: serviceRoleKey,
      NEXT_PUBLIC_SUPABASE_URL: apiUrl,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
      SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
      PUBLIC_ID_SECRET: "integration-placeholder-public-id-secret",
      XAI_API_KEY: "",
      PERSON_KEY_PEPPER: "integration-placeholder-person-key-pepper",
      CRON_SECRET: "integration-placeholder-cron-secret",
      RETENTION_DAYS: "365",
    };

    const result = spawnSync(npx, ["vitest", "run", "--config", "vitest.integration.config.ts"], {
      cwd: root,
      env: testEnv,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    if (result.error) throw result.error;
    return result.status ?? 1;
  } finally {
    const tempDirectory = path.resolve(os.tmpdir());
    const homeDirectory = path.resolve(isolatedHome);
    if (path.dirname(homeDirectory) === tempDirectory && path.basename(homeDirectory).startsWith("convene-integration-home-")) {
      rmSync(homeDirectory, { recursive: true, force: true });
    }
  }
}

process.exitCode = main();
