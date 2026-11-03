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
  beforeEach(() => {
    let introQueryCount = 0;
    const membersQuery = {
      select: vi.fn(() => membersQuery),
      eq: vi.fn(() => membersQuery),
      order: vi.fn(() => Promise.resolve({ data: members, error: null })),
    };
    const existingQuery = {
      select: vi.fn(() => existingQuery),
      eq: vi.fn(() => Promise.resolve({ data: [], error: null })),
    };
    const insertQuery = {
      upsert: vi.fn(() => insertQuery),
      select: vi.fn(async () => ({ data: [{ id: "intro-1" }], error: null })),
    };
    admin.mockReset().mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "members") return membersQuery;
        introQueryCount += 1;
        return introQueryCount === 1 ? existingQuery : insertQuery;
      }),
    });
    notifyEvent.mockReset().mockResolvedValue(undefined);
  });

  it("notifies the event after new intro rows are committed", async () => {
    await recompute("event-1");
    expect(notifyEvent).toHaveBeenCalledOnce();
    expect(notifyEvent).toHaveBeenCalledWith("event-1");
  });
});
