import { beforeEach, describe, expect, it, vi } from "vitest";

const { authorizeEventRequest, bad, getEvent, insertMembers, json, notifyEvent, parseLumaCsv, personKey, recompute } = vi.hoisted(() => ({
  authorizeEventRequest: vi.fn(),
  bad: vi.fn((message: string, status = 400) => Response.json({ error: message }, { status })),
  getEvent: vi.fn(),
  insertMembers: vi.fn(),
  json: vi.fn((body: unknown, status = 200) => Response.json(body, { status })),
  notifyEvent: vi.fn(),
  parseLumaCsv: vi.fn(),
  personKey: vi.fn(),
  recompute: vi.fn(),
}));
const { limit } = vi.hoisted(() => ({ limit: vi.fn(async (): Promise<Response | null> => null) }));

vi.mock("@/lib/auth", () => ({ authorizeEventRequest }));
vi.mock("@/lib/api", () => ({ bad, getEvent, json }));
vi.mock("@/lib/intake", () => ({ insertMembers }));
vi.mock("@/lib/luma", () => ({ parseLumaCsv }));
vi.mock("@/lib/people", () => ({ personKey }));
vi.mock("@/lib/realtime", () => ({ notifyEvent }));
vi.mock("@/lib/recompute", () => ({ recompute }));
vi.mock("@/lib/ratelimit", () => ({ limit, envLimit: (_name: string, fallback: number) => fallback }));

import { POST } from "@/app/api/e/[slug]/import/route";

const event = { id: "event-1", slug: "demo", community_id: "community-1", member_cap: 200, ai_enabled: true };

describe("POST /api/e/[slug]/import broadcasts committed members", () => {
  beforeEach(() => {
    authorizeEventRequest.mockReset().mockResolvedValue({ status: 200 });
    limit.mockReset().mockResolvedValue(null);
    bad.mockClear();
    getEvent.mockReset().mockResolvedValue(event);
    insertMembers.mockReset().mockResolvedValue({ imported: ["member-1"], failed: [], skipped_full: 0, extraction: ["keywords"] });
    json.mockClear();
    notifyEvent.mockReset().mockResolvedValue(undefined);
    parseLumaCsv.mockReset().mockReturnValue({ guests: [{ name: "Ada", line: "Building a useful analytics engine", contact_consent: false }], lineColumn: "What are you building?", speakColumn: null });
    personKey.mockReset().mockReturnValue("person-key");
    recompute.mockReset().mockResolvedValue([]);
  });

  it("notifies the event after successful member import", async () => {
    const response = await POST(
      new Request("http://localhost/api/e/demo/import", { method: "POST", body: "Name,Question\nAda,Building an analytics engine" }),
      { params: Promise.resolve({ slug: "demo" }) },
    );

    expect(response.status).toBe(200);
    expect(insertMembers).toHaveBeenCalledOnce();
    expect(insertMembers).toHaveBeenCalledWith(event, expect.any(Array), 6, { maxMembers: 200, aiEnabled: false });
    expect(await response.json()).toMatchObject({ ai_used: false, failed: [] });
    expect(recompute).toHaveBeenCalledWith(event.id, undefined, { aiEnabled: false });
    expect(notifyEvent).toHaveBeenCalledOnce();
    expect(notifyEvent).toHaveBeenCalledWith(event.id);
  });

  it("enables import AI only after explicit attendee notice acknowledgement", async () => {
    const response = await POST(new Request("http://localhost/api/e/demo/import", {
      method: "POST", headers: { "x-ai-processing-acknowledged": "true" }, body: "Name,Question\nAda,Building an analytics engine",
    }), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(200);
    expect(insertMembers).toHaveBeenCalledWith(event, expect.any(Array), 6, { maxMembers: 200, aiEnabled: true });
    expect(recompute).toHaveBeenCalledWith(event.id, undefined, { aiEnabled: true });
  });

  it("reports row failures while recomputing once for successful rows", async () => {
    insertMembers.mockResolvedValueOnce({ imported: Array.from({ length: 9 }, (_, index) => `member-${index + 1}`), failed: [{ row: 3, reason: "injected failure" }], skipped_full: 0, extraction: ["keywords"] });
    const response = await POST(new Request("http://localhost/api/e/demo/import", {
      method: "POST", headers: { "x-ai-processing-acknowledged": "true" }, body: "Name,Question\nAda,Building tools",
    }), { params: Promise.resolve({ slug: "demo" }) });
    expect(await response.json()).toMatchObject({ imported: 9, failed: [{ row: 3, reason: "injected failure" }] });
    expect(recompute).toHaveBeenCalledOnce();
  });

  it("returns 429 from the import scope limiter", async () => {
    limit.mockResolvedValueOnce(Response.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "60" } }));
    const response = await POST(new Request("http://localhost/api/e/demo/import", { method: "POST", body: "Name,Question\nAda,Building tools" }), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(insertMembers).not.toHaveBeenCalled();
  });

  it("rejects an import body larger than 1 MiB", async () => {
    const response = await POST(new Request("http://localhost/api/e/demo/import", { method: "POST", body: `Name,Question\nAda,${"x".repeat(1024 * 1024)}` }), { params: Promise.resolve({ slug: "demo" }) });
    expect(response.status).toBe(413);
    expect(insertMembers).not.toHaveBeenCalled();
  });
});
