import { beforeEach, describe, expect, it, vi } from "vitest";

const { admin } = vi.hoisted(() => ({ admin: vi.fn() }));
const { limit } = vi.hoisted(() => ({ limit: vi.fn(async (): Promise<Response | null> => null) }));

vi.mock("@/lib/db", () => ({ admin }));
vi.mock("@/lib/ratelimit", () => ({ limit, envLimit: (_name: string, fallback: number) => fallback }));

import { POST } from "@/app/api/events/route";

describe("POST /api/events", () => {
  beforeEach(() => {
    admin.mockReset();
    limit.mockReset().mockResolvedValue(null);
  });

  it("rejects an invalid event name before accessing the database", async () => {
    const response = await POST(
      new Request("http://localhost/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "x" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid input" });
    expect(admin).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON before accessing the database", async () => {
    const response = await POST(
      new Request("http://localhost/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_input" });
    expect(admin).not.toHaveBeenCalled();
  });

  it("rejects oversized JSON and unknown event fields", async () => {
    const oversized = await POST(new Request("http://localhost/api/events", { method: "POST", body: JSON.stringify({ name: "Large event", extra: "x".repeat(5000) }) }));
    expect(oversized.status).toBe(413);
    const unknown = await POST(new Request("http://localhost/api/events", { method: "POST", body: JSON.stringify({ name: "Fresh event", unexpected: true }) }));
    expect(unknown.status).toBe(400);
    expect(admin).not.toHaveBeenCalled();
  });

  it("returns 429 with Retry-After when the event-creation IP bucket is full", async () => {
    limit.mockResolvedValueOnce(Response.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "19" } }));
    const response = await POST(new Request("http://localhost/api/events", { method: "POST", body: JSON.stringify({ name: "Fresh event" }) }));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("19");
    expect(admin).not.toHaveBeenCalled();
  });
});
