import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("docs/DATA.md schema coverage", () => {
  it("lists every column in the members table and its expand migrations", () => {
    const migrationDir = path.join(process.cwd(), "supabase/migrations");
    const files = readdirSync(migrationDir).filter((file) => file.endsWith(".sql")).sort();
    const migrations = files.map((file) => readFileSync(path.join(migrationDir, file), "utf8"));
    const createTable = migrations.join("\n").match(/create table if not exists members \(([\s\S]*?)\n\);/i)?.[1];
    if (!createTable) throw new Error("Could not locate the members schema");
    const columns = new Set<string>();
    for (const line of createTable.split(/\r?\n/)) {
      const column = /^\s*([a-z_]+)\s+(?:uuid|text|boolean|text\[|timestamptz|jsonb|integer|real)\b/i.exec(line)?.[1];
      if (column) columns.add(column);
    }
    for (const migration of migrations) {
      for (const match of migration.matchAll(/alter table public\.members\s+add column if not exists\s+([a-z_]+)/gi)) columns.add(match[1]);
    }
    const docs = readFileSync("docs/DATA.md", "utf8");
    for (const column of columns) expect(docs).toContain(`| \`${column}\` |`);
  });
});
