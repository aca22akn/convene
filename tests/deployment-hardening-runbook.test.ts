import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const runbook = readFileSync("docs/DEPLOY-HARDENING.md", "utf8");

const position = (text: string) => {
  const found = runbook.indexOf(text);
  expect(found, `Missing runbook text: ${text}`).toBeGreaterThanOrEqual(0);
  return found;
};

describe("hardening deployment runbook", () => {
  it("lists the new environment variables in deployment order and protects the build secrets", () => {
    const ordered = [
      "PERSON_KEY_PEPPER",
      "PUBLIC_ID_SECRET",
      "CRON_SECRET",
      "MAX_MEMBERS_PER_EVENT",
      "AI_DAILY_CALL_LIMIT",
      "RETENTION_DAYS",
    ].map(position);
    expect(ordered).toEqual([...ordered].sort((left, right) => left - right));
    expect(runbook).toMatch(/build throws[^.]*PERSON_KEY_PEPPER[^.]*PUBLIC_ID_SECRET/i);
    expect(runbook).toMatch(/Production[^.]*Preview/i);
    expect(runbook).toMatch(/back up[^.]*PERSON_KEY_PEPPER/i);
    expect(runbook).toMatch(/back up[^.]*PUBLIC_ID_SECRET/i);
  });

  it("puts backup, throwaway migration testing, rehashing, deployment, contract, REST check, and cron confirmation in order", () => {
    const backup = position("Back up and export the production project");
    const throwaway = position("throwaway Supabase project");
    const dryRun = position("npm run rehash:people:dry-run");
    const deploy = position("Deploy the application");
    const contract = position("20261102120000_token_sessions_contract.sql.manual");
    const curl = position("curl -i");
    const cron = position("Confirm the retention cron");
    expect([backup, throwaway, dryRun, deploy, contract, curl, cron]).toEqual([... [backup, throwaway, dryRun, deploy, contract, curl, cron]].sort((left, right) => left - right));
    expect(runbook).toMatch(/smoke-test/i);
    expect(runbook).toMatch(/legacy organiser links[^.]*exchange flow/i);
    expect(runbook).toMatch(/anon REST access[^.]*members[^.]*denied/i);
    expect(runbook).toMatch(/rollback/i);
  });

  it("makes the real-key evaluation command and README update explicit", () => {
    expect(runbook).toContain("## Re-run the eval with a real XAI_API_KEY");
    expect(runbook).toContain("npm run eval");
    expect(runbook).toMatch(/Phase 4[^.]*rerank prompt format/i);
    expect(runbook).toMatch(/update the README eval table/i);
  });
});
