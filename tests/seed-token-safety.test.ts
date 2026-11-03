import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("seed admin token handling", () => {
  it("writes only token hashes and never directs users to recover plaintext from the database", () => {
    const script = readFileSync(path.join(process.cwd(), "scripts", "seed.ts"), "utf8");

    expect(script).not.toMatch(/admin_token\s*:/);
    expect(script).toContain("const tokenHash = token ? hashToken(token) : undefined");
    expect(script).toMatch(/const communityTokenHash = tokenHash \?\? existingCommunity\?\.admin_token_hash \?\? hashToken\(generatedCommunityToken \?\? randomBytes\(32\)\.toString\("base64url"\)\)/);
    expect(script).toMatch(/admin_token_hash: communityTokenHash/);
    expect(script).toMatch(/admin_token_hash: hashToken\(randomBytes\(32\)\.toString\("base64url"\)\)/);
    expect(script).toMatch(/const generatedCommunityToken = !token && !existingCommunity\?\.admin_token_hash/);
    expect(script).toContain("New demo community organiser token (shown once; save it now):");
    expect(script).not.toContain("${token}");
    expect(script).not.toMatch(/admin_token_hash:\s*null/);
    expect(script).not.toContain("communities.admin_token");
    expect(script).toMatch(/set ADMIN_TOKEN/i);
  });
});
