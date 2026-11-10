import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { opaqueLiveMemberId } from "@/lib/public-id";

describe("opaque live member IDs", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses PUBLIC_ID_SECRET instead of the Supabase service-role key", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PUBLIC_ID_SECRET", "dedicated-public-id-secret");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");

    expect(opaqueLiveMemberId("event-1", "member-1")).toBe(
      createHmac("sha256", "dedicated-public-id-secret")
        .update("convene-live-member-id:v1:event-1:member-1")
        .digest("base64url"),
    );
  });

  it("requires PUBLIC_ID_SECRET in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PUBLIC_ID_SECRET", "  ");

    expect(() => opaqueLiveMemberId("event-1", "member-1")).toThrow(/PUBLIC_ID_SECRET/);
  });

  it("uses a stable development secret outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("PUBLIC_ID_SECRET", "");

    expect(opaqueLiveMemberId("event-1", "member-1")).toBe(
      createHmac("sha256", "convene-dev-public-id-secret")
        .update("convene-live-member-id:v1:event-1:member-1")
        .digest("base64url"),
    );
  });
});
