import { readFileSync } from "node:fs";
import path from "node:path";
import { sanitizeTestDiagnostic } from "./test-env.mjs";

const logPath = process.argv[2];
if (!logPath || !path.isAbsolute(logPath) || !path.basename(logPath).startsWith("supabase-start")) {
  throw new Error("Pass the absolute path to the temporary supabase-start log.");
}

const diagnostic = sanitizeTestDiagnostic(readFileSync(logPath, "utf8")).trim();
process.stderr.write(`Sanitized local Supabase startup diagnostics:\n${diagnostic.slice(-12_000)}\n`);
