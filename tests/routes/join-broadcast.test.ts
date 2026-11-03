import { beforeEach, describe, expect, it, vi } from "vitest";

const { admin, after, extract, getEvent, notifyEvent, recompute } = vi.hoisted(() => ({
  admin: vi.fn(),
  after: vi.fn(),
  extract: vi.fn(),
  getEvent: vi.fn(),
  notifyEvent: vi.fn(),
  recompute: vi.fn(),
}));

vi.mock("next/server", () => ({ after }));
vi.mock("@/lib/db", () => ({ admin }));
vi.mock("@/lib/api", () => ({
  bad: (message: string, status = 400) => Response.json({ error: message }, { status }),
  getEvent,
  json: (body: unknown, status = 200) => Response.json(body, { status }),
}));
vi.mock("@/lib/extract", () => ({ extract }));
vi.mock("@/lib/people", () => ({ personKey: vi.fn(() => null), upsertPerson: vi.fn() }));
vi.mock("@/lib/realtime", () => ({ notifyEvent }));
vi.mock("@/lib/recompute", () => ({ recompute }));

import { POST } from "@/app/api/e/[slug]/join/route";

const event = { id: "event-1", slug: "demo", name: "Demo night", community_id: null, created_at: "2026-10-22T19:00:00.000Z" };
const callbacks: (() => Promise<void>)[] = [];

describe("POST /api/e/[slug]/join broadcasts updates", () => {
  beforeEach(() => {
    callbacks.length = 0;
    admin.mockReset().mockReturnValue({
      from: vi.fn(() => ({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({ single: vi.fn(async () => ({ data: { id: "member-1" }, error: null })) })),
        })),
      })),
    });
    after.mockReset().mockImplementation((callback: () => Promise<void>) => callbacks.push(callback));
    extract.mockReset().mockResolvedValue({ offers: [], seeks: [], topics: [], speak_topics: [], source: "keywords", ms: 1 });
    getEvent.mockReset().mockResolvedValue(event);
    notifyEvent.mockReset().mockResolvedValue(undefined);
    recompute.mockReset().mockResolvedValue([]);
  });

  it("notifies after the join and again after recompute commits intros", async () => {
    const response = await POST(
      new Request("http://localhost/api/e/demo/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Priya Raman", line: "Building a useful tool and looking for design feedback" }),
      }),
      { params: Promise.resolve({ slug: "demo" }) },
    );

    expect(response.status).toBe(200);
    expect(callbacks).toHaveLength(1);
    await callbacks[0]();

    expect(notifyEvent).toHaveBeenCalledTimes(2);
    expect(notifyEvent).toHaveBeenNthCalledWith(1, event.id);
    expect(recompute).toHaveBeenCalledWith(event.id, "member-1");
    expect(notifyEvent).toHaveBeenNthCalledWith(2, event.id);
  });
});
