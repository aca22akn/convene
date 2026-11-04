import { readFileSync } from "node:fs";
import path from "node:path";
import { sanitizeTestDiagnostic } from "./test-env.mjs";

const logPath = process.argv[2];
const allowedLogNames = new Set([
  "supabase-start.log",
  "supabase-migration-test.log",
  "supabase-integration-test.log",
]);
if (!logPath || !path.isAbsolute(logPath) || !allowedLogNames.has(path.basename(logPath))) {
  throw new Error("Pass the absolute path to a supported temporary Supabase log.");
}

const diagnostic = sanitizeTestDiagnostic(readFileSync(logPath, "utf8")).trim();
process.stderr.write(`Sanitized Supabase diagnostics from ${path.basename(logPath)}:\n${diagnostic.slice(-12_000)}\n`);
