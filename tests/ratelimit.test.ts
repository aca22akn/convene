import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { admin } = vi.hoisted(() => ({ admin: vi.fn() }));
vi.mock("@/lib/db", () => ({ admin }));

import { limit, retryAfterSeconds } from "@/lib/ratelimit";

describe("Postgres-backed rate limiting", () => {
  const rpc = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-04T12:09:59.000Z"));
    rpc.mockReset();
    admin.mockReset().mockReturnValue({ rpc });
  });

  afterEach(() => vi.useRealTimers());

  it("computes retry time to the next fixed-window boundary", () => {
    expect(retryAfterSeconds(600)).toBe(1);
    expect(retryAfterSeconds(60, new Date("2026-11-04T12:10:00.000Z").getTime())).toBe(60);
  });

  it("uses Vercel's trusted forwarded IP and returns 429 with Retry-After when full", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    const req = new Request("https://convene.example/api/e/demo/join", {
      headers: { "x-vercel-forwarded-for": "203.0.113.7" },
    });

    const response = await limit(req, "join-ip", { limit: 8, windowSeconds: 600 });

    expect(response?.status).toBe(429);
    expect(response?.headers.get("retry-after")).toBe("1");
    expect(await response?.json()).toEqual({ error: "rate_limited" });
    expect(rpc).toHaveBeenCalledWith("rate_limit_hit", {
      p_key: "join-ip:203.0.113.7",
      p_limit: 8,
      p_window_seconds: 600,
    });
  });

  it("ignores spoofable forwarded-for and applies the stricter shared unknown-IP limit", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    const req = new Request("https://convene.example/api/events", {
      headers: { "x-forwarded-for": "198.51.100.9" },
    });

    await limit(req, "event-create-ip", { limit: 5, windowSeconds: 3600 });

    expect(rpc).toHaveBeenCalledWith("rate_limit_hit", {
      p_key: "event-create-ip:unknown",
      p_limit: 2,
      p_window_seconds: 3600,
    });
  });

  it("uses an explicit scope key instead of the caller IP", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    const req = new Request("https://convene.example/api/e/demo/import", {
      headers: { "x-vercel-forwarded-for": "203.0.113.7" },
    });

    await limit(req, "import", { limit: 6, windowSeconds: 3600, extraKey: "event-123" });

    expect(rpc).toHaveBeenCalledWith("rate_limit_hit", {
      p_key: "import:event-123",
      p_limit: 6,
      p_window_seconds: 3600,
    });
  });

  it("fails closed if the Postgres limiter is unavailable", async () => {
    rpc.mockResolvedValue({ data: null, error: new Error("rpc unavailable") });

    const response = await limit(new Request("https://convene.example/api/events"), "event-create-ip", {
      limit: 5,
      windowSeconds: 3600,
    });

    expect(response?.status).toBe(503);
    expect(response?.headers.get("retry-after")).toBe("60");
  });
});
