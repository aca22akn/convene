import { beforeEach, describe, expect, it, vi } from "vitest";

const { admin } = vi.hoisted(() => ({ admin: vi.fn() }));
vi.mock("@/lib/db", () => ({ admin }));

import { loadCommunityRows } from "@/lib/mcpTools";

describe("LLM MCP member filtering", () => {
  beforeEach(() => {
    const events = [
      { id: "event-ai", slug: "ai", community_id: "community-1", ai_enabled: true },
      { id: "event-off", slug: "off", community_id: "community-1", ai_enabled: false },
    ];
    const members = [
      { id: "member-ok", event_id: "event-ai", name: "Allowed", line: "Building tools", ai_opt_out: false },
      { id: "member-opted", event_id: "event-ai", name: "Opted out", line: "Private text", ai_opt_out: true },
      { id: "member-disabled", event_id: "event-off", name: "Disabled event", line: "No AI", ai_opt_out: false },
    ];
    admin.mockReturnValue({
      from: (table: string) => {
        let rows: Record<string, unknown>[] = table === "events" ? events : members;
        const query = {
          select: () => query,
          eq: (key: string, value: unknown) => { rows = rows.filter((row) => row[key] === value); return query; },
          in: (key: string, values: unknown[]) => { rows = rows.filter((row) => values.includes(row[key])); return query; },
          then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve, reject),
        };
        return query;
      },
    });
  });

  it("excludes disabled events and opted-out attendees from an LLM-scoped query", async () => {
    const rows = await loadCommunityRows("community-1", { aiEnabledOnly: true, excludeAiOptOut: true });
    expect(rows.map((row) => row.id)).toEqual(["member-ok"]);
  });
});
