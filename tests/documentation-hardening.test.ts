import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const readme = readFileSync(path.join(root, "README.md"), "utf8");

describe("Phase 7 hardening documentation", () => {
  it("documents the tested commit semantics instead of claiming idempotent recompute", () => {
    expect(readme).not.toMatch(/idempotent recompute|recompute is idempotent/i);
    expect(readme).toContain("convene_commit_intros");
    expect(readme).toMatch(/concurrent plans/i);
  });

  it("describes broadcasts, sessions, commit RPCs, and the documented privacy controls", () => {
    expect(readme).toMatch(/server-side session/i);
    expect(readme).toMatch(/broadcast/i);
    expect(readme).toContain("convene_commit_intros");
    expect(readme).toContain("ai_enabled");
    expect(readme).toContain("ai_opt_out");
    expect(readme).toContain("docs/DATA.md");
  });

  it("keeps Limits to measured capacity, benchmark, and default-budget constraints", () => {
    expect(readme).toContain("## Limits");
    expect(readme).toMatch(/\| 200 \|/);
    expect(readme).toContain("8 joins per 10 minutes per IP");
    expect(readme).toContain("3,000 per UTC day globally");
  });

  it("ships a security policy and records this hardening pass", () => {
    const securityPath = path.join(root, "SECURITY.md");
    expect(existsSync(securityPath)).toBe(true);
    const security = readFileSync(securityPath, "utf8");
    expect(security).toMatch(/## Threat model/i);
    expect(security).toMatch(/## Reporting/i);
    expect(security).toMatch(/## Token model/i);
    expect(security).toMatch(/## Public data/i);
    expect(readFileSync(path.join(root, "BUILD_LOG.md"), "utf8")).toMatch(/Phase 7/i);
  });
});
