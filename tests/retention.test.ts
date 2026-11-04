import { afterEach, describe, expect, it, vi } from "vitest";

const { admin } = vi.hoisted(() => ({ admin: vi.fn() }));
vi.mock("@/lib/db", () => ({ admin }));

import { GET, retentionCutoff } from "@/app/api/cron/retention/route";

describe("retention cron", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("computes the event cutoff from a fake clock and configured retention", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-04T12:00:00.000Z"));
    vi.stubEnv("RETENTION_DAYS", "365");
    expect(retentionCutoff(new Date(), 365)).toBe("2025-11-04T12:00:00.000Z");
  });

  it("requires the configured CRON_SECRET bearer token", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret-test");
    const response = await GET(new Request("https://convene.example/api/cron/retention"));
    expect(response.status).toBe(401);
    expect(admin).not.toHaveBeenCalled();
  });
});
