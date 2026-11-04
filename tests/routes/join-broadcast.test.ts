import { beforeEach, describe, expect, it, vi } from "vitest";

const { admin, after, extract, getEvent, notifyEvent, recompute } = vi.hoisted(() => ({
  admin: vi.fn(),
  after: vi.fn(),
  extract: vi.fn(),
  getEvent: vi.fn(),
  notifyEvent: vi.fn(),
  recompute: vi.fn(),
}));
const { limit } = vi.hoisted(() => ({ limit: vi.fn(async (): Promise<Response | null> => null) }));

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
vi.mock("@/lib/ratelimit", () => ({ limit, envLimit: (_name: string, fallback: number) => fallback }));

import { POST } from "@/app/api/e/[slug]/join/route";

const event = { id: "event-1", slug: "demo", name: "Demo night", community_id: null, created_at: "2026-10-22T19:00:00.000Z", ai_enabled: false };
const callbacks: (() => Promise<void>)[] = [];

describe("POST /api/e/[slug]/join broadcasts updates", () => {
  beforeEach(() => {
    callbacks.length = 0;
    limit.mockReset().mockResolvedValue(null);
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
    expect(extract).toHaveBeenCalledWith(expect.any(String), undefined, { eventId: event.id, signal: expect.any(AbortSignal), enabled: false });
    expect(callbacks).toHaveLength(1);
    await callbacks[0]();

    expect(notifyEvent).toHaveBeenCalledTimes(2);
    expect(notifyEvent).toHaveBeenNthCalledWith(1, event.id);
    expect(recompute).toHaveBeenCalledWith(event.id, "member-1", { signal: expect.any(AbortSignal), aiEnabled: false });
    expect(notifyEvent).toHaveBeenNthCalledWith(2, event.id);
  });

  it("returns 429 from the IP limiter before looking up an event", async () => {
    limit.mockResolvedValueOnce(Response.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "1" } }));
    const response = await POST(new Request("http://localhost/api/e/demo/join", { method: "POST", body: "{}" }), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("1");
    expect(getEvent).not.toHaveBeenCalled();
  });

  it("rejects a closed event with a clear 403 before extraction or insert", async () => {
    getEvent.mockResolvedValue({ ...event, joins_closed: true });
    const response = await POST(
      new Request("http://localhost/api/e/demo/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Priya Raman", line: "Building a useful tool and looking for design feedback" }),
      }),
      { params: Promise.resolve({ slug: "demo" }) },
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "doors are closed" });
    expect(extract).not.toHaveBeenCalled();
    expect(admin).not.toHaveBeenCalled();
  });

  it("returns 413 for an oversized request and rejects unknown input keys", async () => {
    const oversized = await POST(new Request("http://localhost/api/e/demo/join", { method: "POST", body: JSON.stringify({ name: "Ada", line: "x".repeat(5000) }) }), { params: Promise.resolve({ slug: "demo" }) });
    expect(oversized.status).toBe(413);
    const unknown = await POST(new Request("http://localhost/api/e/demo/join", { method: "POST", body: JSON.stringify({ name: "Ada", line: "Building useful tools", unexpected: true }) }), { params: Promise.resolve({ slug: "demo" }) });
    expect(unknown.status).toBe(400);
  });
});
