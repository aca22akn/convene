import { beforeEach, describe, expect, it, vi } from "vitest";

const { admin, extract } = vi.hoisted(() => ({ admin: vi.fn(), extract: vi.fn() }));
vi.mock("@/lib/db", () => ({ admin }));
vi.mock("@/lib/extract", () => ({ extract, pool: async (items: unknown[], _concurrency: number, run: (item: unknown) => Promise<unknown>) => Promise.all(items.map(run)) }));
vi.mock("@/lib/people", () => ({ personKey: vi.fn(), upsertPerson: vi.fn() }));

import { insertMembers } from "@/lib/intake";

describe("bulk intake directory consent", () => {
  beforeEach(() => {
    extract.mockReset().mockResolvedValue({ offers: [], seeks: [], topics: [], speak_topics: [], source: "keywords" });
  });

  it("persists explicit consent and defaults imports to non-consenting", async () => {
    const inserted: Record<string, unknown>[] = [];
    admin.mockReturnValue({
      from: vi.fn(() => ({
        insert: vi.fn((row: Record<string, unknown>) => {
          inserted.push(row);
          return { select: vi.fn(() => ({ single: vi.fn(async () => ({ data: { id: `member-${inserted.length}` }, error: null })) })) };
        }),
      })),
    });

    const base = { name: "Sample Person", line: "Building a tool", contact_consent: false, directory_consent: false };
    await insertMembers({ id: "event-1", community_id: null }, [
      { ...base, directory_consent: true },
      base,
    ]);

    expect(inserted.map((row) => row.directory_consent)).toEqual([true, false]);
  });
});
