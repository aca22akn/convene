import { beforeEach, describe, expect, it, vi } from "vitest";

const { admin, notifyEvent } = vi.hoisted(() => ({ admin: vi.fn(), notifyEvent: vi.fn() }));
vi.mock("@/lib/db", () => ({ admin }));
vi.mock("@/lib/realtime", () => ({ notifyEvent }));
vi.mock("@/lib/match", () => ({
  assignBlossom: vi.fn((edges: unknown[]) => edges),
  candidates: vi.fn(() => [{ a: "member-a", b: "member-b", tagScore: 1, weight: 1, reasons: [] }]),
  pairKey: (a: string, b: string) => [a, b].sort().join(":"),
  tagScore: vi.fn(() => 1),
  templateReasons: vi.fn(() => []),
}));

import { recompute } from "@/lib/recompute";

const members = [
  { id: "member-a", event_id: "event-1", name: "A", line: "Building a tool", offers: [], seeks: [], topics: [], speak_topics: [], is_sample: false, created_at: "2026-10-22T19:00:00.000Z" },
  { id: "member-b", event_id: "event-1", name: "B", line: "Looking for a tool", offers: [], seeks: [], topics: [], speak_topics: [], is_sample: false, created_at: "2026-10-22T19:01:00.000Z" },
];

describe("recompute broadcasts committed intros", () => {
  const committed = { id: "intro-1", event_id: "event-1", a_id: "member-a", b_id: "member-b", score: 1, reasons: [] };

  beforeEach(() => {
    const membersQuery = {
      select: vi.fn(() => membersQuery),
      eq: vi.fn(() => membersQuery),
      order: vi.fn(() => Promise.resolve({ data: members, error: null })),
    };
    const existingQuery = {
      select: vi.fn(() => existingQuery),
      eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
    };
    admin.mockReset().mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "members") return membersQuery;
        if (table === "events") return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { ai_enabled: false }, error: null }) }) }) };
        return existingQuery;
      }),
      rpc: vi.fn(async () => ({ data: [committed], error: null })),
    });
    notifyEvent.mockReset().mockResolvedValue(undefined);
  });

  it("notifies the event after new intro rows are committed", async () => {
    await recompute("event-1");
    expect(notifyEvent).toHaveBeenCalledOnce();
    expect(notifyEvent).toHaveBeenCalledWith("event-1");
  });

  it("refreshes the snapshot and retries a dropped plan when the newcomer still has capacity", async () => {
    const db = {
      from: vi.fn((table: string) => {
        if (table === "members") {
          const query = { select: () => query, eq: () => query, order: async () => ({ data: members, error: null }) };
          return query;
        }
        const query = { select: () => query, eq: () => Promise.resolve({ data: [], error: null }) };
        return query;
      }),
      rpc: vi.fn()
        .mockResolvedValueOnce({ data: [], error: null })
        .mockResolvedValueOnce({ data: [committed], error: null }),
    };
    admin.mockReturnValue(db);

    const result = await recompute("event-1", "member-a", { aiEnabled: false });
    expect(result).toEqual([committed]);
    expect(db.rpc).toHaveBeenCalledTimes(2);
    expect(db.rpc).toHaveBeenCalledWith("convene_commit_intros", { p_event: "event-1", p_pairs: expect.any(Array) });
    expect(notifyEvent).toHaveBeenCalledOnce();
  });

  it("re-plans at most twice after repeated drops", async () => {
    const db = {
      from: vi.fn((table: string) => {
        if (table === "members") {
          const query = { select: () => query, eq: () => query, order: async () => ({ data: members, error: null }) };
          return query;
        }
        const query = { select: () => query, eq: () => Promise.resolve({ data: [], error: null }) };
        return query;
      }),
      rpc: vi.fn(async () => ({ data: [], error: null })),
    };
    admin.mockReturnValue(db);

    await recompute("event-1", "member-a", { aiEnabled: false });
    expect(db.rpc).toHaveBeenCalledTimes(3);
  });
});
