import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import OrganiserPage from "@/app/e/[slug]/organiser/page";

describe("auth hardening regressions", () => {
  it("does not expose the legacy query token in the organiser page response", async () => {
    const secret = "legacy-organiser-secret-should-stay-in-the-url-only";
    const page = await OrganiserPage({
      params: Promise.resolve({ slug: "northstar" }),
      searchParams: Promise.resolve({ token: secret }),
    });

    expect(renderToStaticMarkup(page)).not.toContain(secret);
  });

  it("revokes browser access to the hashed session token table", () => {
    const migrationPath = path.join(process.cwd(), "supabase", "migrations", "20261102100000_token_sessions.sql");
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toMatch(/revoke\s+all\s+privileges\s+on\s+table\s+(public\.)?access_tokens\s+from\s+anon\s*,\s*authenticated/i);
    expect(migration).toMatch(/grant\s+all\s+privileges\s+on\s+table\s+public\.access_tokens\s+to\s+service_role/i);
    expect(migration).toMatch(/create schema if not exists extensions/i);
    expect(migration).toMatch(/create extension if not exists pgcrypto with schema extensions/i);
    expect(migration).toMatch(/extensions\.digest\(admin_token,\s*'sha256'\)/i);
    expect(migration.match(/set admin_token_hash = encode\(extensions\.digest\(admin_token, 'sha256'\), 'hex'\)/gi)).toHaveLength(2);
    expect(migration).toMatch(/update events\s+as e\s+set admin_token_hash = null\s+where exists\s*\(\s*select 1 from communities as c where c\.admin_token_hash = e\.admin_token_hash\s*\)/i);
    expect(migration.match(/row_number\(\) over \(partition by admin_token_hash order by id\)/gi)).toHaveLength(2);
    expect(migration).not.toMatch(/alter table (public\.)?(communities|events) alter column admin_token drop default/i);
    expect(migration).toMatch(/create trigger communities_admin_token_hash_insert/i);
    expect(migration).toMatch(/create trigger communities_admin_token_hash_legacy_update/i);
    expect(migration).toMatch(/create trigger communities_admin_token_hash_new_update/i);
    expect(migration).toMatch(/create trigger events_admin_token_hash_insert/i);
    expect(migration).toMatch(/create trigger events_admin_token_hash_legacy_update/i);
    expect(migration).toMatch(/create trigger events_admin_token_hash_new_update/i);
    expect(migration).toMatch(/if new\.admin_token_hash is not null then\s+new\.admin_token := null/i);
    expect(migration).toMatch(/new\.admin_token_hash := encode\(extensions\.digest\(new\.admin_token, 'sha256'\), 'hex'\)/i);
  });

  it("repairs compatibility for installations that already applied the earlier token expand migration", () => {
    const migrationPath = path.join(process.cwd(), "supabase", "migrations", "20261103100000_token_sessions_expand_compat.sql");
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toMatch(/create schema if not exists extensions/i);
    expect(migration).toMatch(/create extension if not exists pgcrypto with schema extensions/i);
    expect(migration).toMatch(/alter table public\.communities alter column admin_token set default replace\(gen_random_uuid\(\)::text, '-', ''\)/i);
    expect(migration).toMatch(/alter table public\.events alter column admin_token set default replace\(gen_random_uuid\(\)::text, '-', ''\)/i);
    expect(migration.match(/row_number\(\) over \(partition by encode\(extensions\.digest\(admin_token, 'sha256'\), 'hex'\) order by id\)/gi)).toHaveLength(2);
    expect(migration.match(/candidate\.token_rank = 1/gi)).toHaveLength(2);
    expect(migration).toMatch(/create or replace function public\.sync_admin_token_hash\(\)/i);
    expect(migration).toMatch(/create trigger communities_admin_token_hash_insert/i);
    expect(migration).toMatch(/create trigger events_admin_token_hash_insert/i);
    expect(migration).toMatch(/revoke all privileges on table public\.access_tokens from anon, authenticated/i);
  });

  it("does not depend on search_path for pgcrypto migration calls", () => {
    const migrationDir = path.join(process.cwd(), "supabase", "migrations");
    const extensionFunctions = "digest|hmac|gen_random_bytes|crypt|gen_salt|encrypt|decrypt|pgp_sym_encrypt|pgp_sym_decrypt|pgp_pub_encrypt|pgp_pub_decrypt|armor|dearmor";
    const unqualifiedCall = new RegExp(`(?:^|[^\\w.])(?:${extensionFunctions})\\s*\\(`, "gi");

    for (const file of readdirSync(migrationDir).filter((name) => /\.sql(?:\.manual)?$/.test(name))) {
      const migration = readFileSync(path.join(migrationDir, file), "utf8");
      expect(migration.match(unqualifiedCall) ?? [], `${file} must schema-qualify pgcrypto calls`).toEqual([]);
    }
  });

  it("keeps plaintext-token removal in a later contract migration", () => {
    const migrationDir = path.join(process.cwd(), "supabase", "migrations");
    const files = readdirSync(migrationDir);
    const contractFile = files.find((file) => /^\d+_token_sessions_contract\.sql\.manual$/.test(file));

    expect(contractFile).toBeTruthy();
    expect(contractFile).toMatch(/\.sql\.manual$/);
    expect(Number(contractFile?.split("_")[0])).toBeGreaterThan(20261102100000);
    const contract = readFileSync(path.join(migrationDir, contractFile!), "utf8");
    expect(contract).toMatch(/drop trigger if exists .*admin_token_hash/i);
    expect(contract).toMatch(/drop function if exists public\.sync_admin_token_hash\(\)/i);
    expect(contract).toMatch(/alter table public\.communities drop column if exists admin_token/i);
    expect(contract).toMatch(/alter table public\.events drop column if exists admin_token/i);
    expect(contract.indexOf("drop function if exists public.sync_admin_token_hash()"))
      .toBeLessThan(contract.indexOf("drop column if exists admin_token"));
  });

  it("documents that the manual contract follows deployment and link verification", () => {
    const readme = readFileSync(path.join(process.cwd(), "README.md"), "utf8");
    expect(readme).toMatch(/token_sessions_contract\.sql\.manual/i);
    expect(readme).toMatch(/after deploying the hash-based app/i);
    expect(readme).toMatch(/verify legacy organiser links/i);
  });
});
