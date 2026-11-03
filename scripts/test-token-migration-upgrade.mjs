import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
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

async function main() {
  if (process.env.CI !== "true") {
    throw new Error("The token migration upgrade fixture may only reset a disposable CI Supabase database.");
  }

  const isolatedHome = mkdtempSync(path.join(os.tmpdir(), "convene-migration-upgrade-home-"));
  try {
    const cliEnv = createIsolatedTestEnv(process.env, isolatedHome, {
      NPM_CONFIG_USERCONFIG: path.join(isolatedHome, ".npmrc"),
      NPM_CONFIG_GLOBALCONFIG: path.join(isolatedHome, "npm-globalrc"),
      NPM_CONFIG_CACHE: path.join(isolatedHome, ".npm-cache"),
      SUPABASE_HOME: isolatedHome,
      SUPABASE_TELEMETRY_DISABLED: "1",
    });

    const status = run(npx, ["supabase", "status", "--output", "env"], cliEnv, { capture: true });
    if (status.status !== 0) {
      const diagnostic = sanitizeTestDiagnostic(status.stderr ?? "").trim();
      if (diagnostic) process.stderr.write(`Supabase CLI diagnostic:\n${diagnostic.slice(0, 4000)}\n`);
      throw new Error("The disposable local Supabase stack must be running before the migration upgrade fixture.");
    }

    const values = parseStatusEnv(status.stdout ?? "");
    const apiUrl = values.get("API_URL");
    const anonKey = values.get("ANON_KEY");
    const serviceRoleKey = values.get("SERVICE_ROLE_KEY");
    if (!apiUrl || !isLoopback(apiUrl) || !anonKey || !serviceRoleKey) {
      throw new Error("Migration upgrade tests require loopback API, anon, and service-role values from local Supabase.");
    }

    const baseVersion = "20261022190000";
    const reset = run(npx, ["supabase", "db", "reset", "--version", baseVersion, "--yes"], cliEnv);
    if (reset.status !== 0) throw new Error(`Local Supabase reset to ${baseVersion} failed.`);

    const service = createClient(apiUrl, serviceRoleKey, { auth: { persistSession: false } });
    const communityToken = "local-migration-fixture-community-token";
    const eventToken = "local-migration-fixture-event-token";
    const duplicateEventToken = "local-migration-fixture-duplicate-event-token";
    const { data: community, error: communityError } = await service
      .from("communities")
      .insert({ slug: "migration-upgrade-fixture", name: "Migration fixture", admin_token: communityToken })
      .select("id")
      .single();
    if (communityError) throw communityError;

    const { error: eventError } = await service.from("events").insert([
      { slug: "migration-upgrade-shared-a", name: "Legacy shared A", community_id: community.id, admin_token: communityToken },
      { slug: "migration-upgrade-shared-b", name: "Legacy shared B", community_id: community.id, admin_token: communityToken },
      { slug: "migration-upgrade-event", name: "Legacy event", community_id: community.id, admin_token: eventToken },
      { id: "10000000-0000-4000-8000-000000000001", slug: "migration-upgrade-duplicate-a", name: "Legacy duplicate A", community_id: community.id, admin_token: duplicateEventToken },
      { id: "10000000-0000-4000-8000-000000000002", slug: "migration-upgrade-duplicate-b", name: "Legacy duplicate B", community_id: community.id, admin_token: duplicateEventToken },
    ]);
    if (eventError) throw eventError;

    const migration = run(npx, ["supabase", "migration", "up", "--include-all"], cliEnv);
    if (migration.status !== 0) throw new Error("Applying local migrations after legacy fixture seeding failed.");

    const testEnv = {
      ...cliEnv,
      API_URL: apiUrl,
      ANON_KEY: anonKey,
      SERVICE_ROLE_KEY: serviceRoleKey,
      NEXT_PUBLIC_SUPABASE_URL: apiUrl,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
      SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
      PUBLIC_ID_SECRET: "integration-placeholder-public-id-secret",
      PERSON_KEY_PEPPER: "integration-placeholder-person-key-pepper",
      XAI_API_KEY: "",
    };
    const tests = run(npx, ["vitest", "run", "--config", "vitest.integration-upgrade.config.ts"], testEnv);
    if (tests.status !== 0) throw new Error("Legacy token migration upgrade assertions failed.");
  } finally {
    const tempDirectory = path.resolve(os.tmpdir());
    const homeDirectory = path.resolve(isolatedHome);
    if (path.dirname(homeDirectory) === tempDirectory && path.basename(homeDirectory).startsWith("convene-migration-upgrade-home-")) {
      rmSync(homeDirectory, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown migration upgrade test failure";
  process.stderr.write(`Migration upgrade test failed: ${message}\n`);
  process.exitCode = 1;
});
