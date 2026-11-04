import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const readme = readFileSync(path.join(process.cwd(), "README.md"), "utf8");

describe("deployment and migration documentation", () => {
  it("documents the persistent person-key pepper in the self-host setup", () => {
    const selfHost = readme.split("## Self-host in 5 minutes")[1]?.split("## Architecture")[0] ?? "";
    expect(selfHost).toContain("PERSON_KEY_PEPPER");
    expect(selfHost).toContain("Keep the pepper unchanged");
    expect(selfHost).toContain("PUBLIC_ID_SECRET");
    expect(selfHost).toContain("Vercel");
    expect(selfHost).toContain("Preview");
    expect(selfHost).toContain("unrecoverable");
  });

  it("requires the full standard migration set and documents the existing-install rehash", () => {
    expect(readme).toMatch(/apply every standard timestamped migration/i);
    expect(readme).toContain("npm run rehash:people:dry-run");
    expect(readme).toContain("npm run rehash:people");
    expect(readme).toContain("20261102120000_token_sessions_contract.sql.manual");
    expect(readme).toMatch(/Do not apply the manual contract before the hash-based app is deployed and verified/);
  });

  it("documents the Linux production-build check and trusted proxy requirement", () => {
    expect(readme).toContain("verified only in Linux CI");
    expect(readme).toContain("x-vercel-forwarded-for");
    expect(readme).toContain("unknown` bucket capped at 2 requests per window");
    expect(readme).toContain("trustedIp()");
  });
});
