import { afterEach, describe, expect, it, vi } from "vitest";
import { connectSources } from "@/proxy";
import nextConfig from "@/next.config";

describe("production Content Security Policy", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("allows only the configured Supabase origin and its websocket origin", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project-123.supabase.co");

    expect(connectSources().split(" ")).toEqual([
      "'self'",
      "https://project-123.supabase.co",
      "wss://project-123.supabase.co",
    ]);
  });

  it("adds local Supabase endpoints only in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");

    expect(connectSources().split(" ")).toEqual([
      "'self'",
      "http://localhost:54321",
      "ws://localhost:54321",
      "http://127.0.0.1:54321",
      "ws://127.0.0.1:54321",
    ]);
  });
});

describe("global security response headers", () => {
  it("sets HSTS for HTTPS deployments", async () => {
    const rules = await nextConfig.headers?.();
    const globalRule = rules?.find((rule) => rule.source === "/:path*");
    expect(globalRule?.headers).toContainEqual({ key: "Strict-Transport-Security", value: "max-age=31536000" });
  });
});
