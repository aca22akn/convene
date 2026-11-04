import { beforeEach, describe, expect, it, vi } from "vitest";

const { admin, extract, personKey, upsertPerson } = vi.hoisted(() => ({
  admin: vi.fn(), extract: vi.fn(), personKey: vi.fn(() => null), upsertPerson: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ admin }));
vi.mock("@/lib/extract", () => ({ extract, pool: async <T, R>(items: T[], _concurrency: number, fn: (row: T, index: number) => Promise<R>) => {
  const results = await Promise.all(items.map(async (row, index) => {
    try { return { row, ok: true as const, value: await fn(row, index) }; }
    catch (error) { return { row, ok: false as const, error }; }
  }));
  return results;
} }));
vi.mock("@/lib/people", () => ({ personKey, upsertPerson }));

import { insertMembers } from "@/lib/intake";

const tags = { offers: ["data"], seeks: [], topics: ["data"], speak_topics: [], source: "keywords" as const };

describe("Luma intake idempotency", () => {
  const rows: Record<string, unknown>[] = [];
  let idCounter = 0;

  beforeEach(() => {
    rows.splice(0);
    idCounter = 0;
    extract.mockReset().mockResolvedValue(tags);
    admin.mockReturnValue({ from: vi.fn((table: string) => {
      let mode: "select" | "insert" | "update" = "select";
      let payload: Record<string, unknown> = {};
      const filters: [string, unknown, "eq" | "in"][] = [];
      const query: Record<string, (...args: unknown[]) => unknown> = {};
      const matching = () => rows.filter((row) => filters.every(([key, value, op]) => op === "eq" ? row[key] === value : (value as unknown[]).includes(row[key])));
      const execute = () => {
        if (table !== "members") throw new Error(`Unexpected table ${table}`);
        if (mode === "insert") {
          const inserted = { ...payload, id: `member-${++idCounter}` };
          rows.push(inserted);
          return { data: inserted, error: null };
        }
        if (mode === "update") {
          const found = matching()[0];
          if (found) Object.assign(found, payload);
          return { data: found ?? null, error: null };
        }
        return { data: matching(), count: rows.filter((row) => row.event_id === "event-1").length, error: null };
      };
      Object.assign(query, {
        select: () => query,
        eq: (key: string, value: unknown) => { filters.push([key, value, "eq"]); return query; },
        in: (key: string, value: unknown) => { filters.push([key, value, "in"]); return query; },
        insert: (value: Record<string, unknown>) => { mode = "insert"; payload = value; return query; },
        update: (value: Record<string, unknown>) => { mode = "update"; payload = value; return query; },
        single: async () => execute(),
        then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(execute()).then(resolve, reject),
      });
      return query;
    }) });
  });

  it("skips identical source rows and updates/re-extracts only a changed line", async () => {
    const event = { id: "event-1", community_id: null };
    const firstRow = { name: "Ada", line: "Building a climate data platform", source_guest_id: "luma:guest-1", contact_consent: false, directory_consent: false, ai_opt_out: false };
    const first = await insertMembers(event, [firstRow], 2, { aiEnabled: false });
    const same = await insertMembers(event, [firstRow], 2, { aiEnabled: false });
    const updated = await insertMembers(event, [{ ...firstRow, line: "Building a climate data and hiring platform" }], 2, { aiEnabled: false });

    expect(first.imported).toHaveLength(1);
    expect(same.imported).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.line).toBe("Building a climate data and hiring platform");
    expect(updated.imported).toEqual(first.imported);
    expect(extract).toHaveBeenCalledTimes(2);
  });

  it("settles all ten rows when row three fails, retaining the other nine IDs", async () => {
    extract.mockImplementation(async (line: string) => {
      if (line === "row 3 line") throw { message: "injected row three failure", code: "XX003" };
      return tags;
    });
    const batch = Array.from({ length: 10 }, (_, index) => ({
      name: `Guest ${index + 1}`, line: `row ${index + 1} line`, contact_consent: false,
      directory_consent: false, ai_opt_out: false,
    }));
    const result = await insertMembers({ id: "event-1", community_id: null }, batch, 4, { aiEnabled: false });

    expect(result.imported).toHaveLength(9);
    expect(result.results.filter((row) => row.ok)).toHaveLength(9);
    expect(result.results.filter((row) => row.ok).every((row) => row.id.startsWith("member-"))).toBe(true);
    expect(result.failed).toEqual([{ row: 3, reason: "injected row three failure" }]);
    expect(rows).toHaveLength(9);
    expect(extract).toHaveBeenCalledTimes(10);
  });
});
