import { beforeEach, describe, expect, it, vi } from "vitest";

const { admin, create } = vi.hoisted(() => ({ admin: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/db", () => ({ admin }));
vi.mock("@/lib/grok", () => ({ aiClient: () => ({ chat: { completions: { create } } }), aiModel: () => "test-model", aiProviderName: () => "test provider" }));

import { extract } from "@/lib/extract";
import { aiCallAllowed } from "@/lib/ai-budget";

describe("daily AI spend guard", () => {
  let globalCalls: number;
  let eventCalls: number;
  beforeEach(() => {
    globalCalls = 0;
    eventCalls = 0;
    admin.mockReturnValue({ rpc: vi.fn(async (_name: string, { p_key, p_limit }: { p_key: string; p_limit: number }) => {
      if (p_key.startsWith("ai:day:")) return { data: ++globalCalls <= 2, error: null };
      if (p_key.startsWith("ai:event:")) return { data: ++eventCalls <= p_limit, error: null };
      return { data: true, error: null };
    }) });
    create.mockReset().mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ offers: ["design"], seeks: [], topics: ["design"], speak_topics: [] }) } }] });
  });

  it("does not call the provider for a third join over the daily budget and still extracts keyword tags", async () => {
    const results = await Promise.all([
      extract("Building a design tool", null, { eventId: "event-1" }),
      extract("Building a design tool", null, { eventId: "event-1" }),
      extract("Building a design tool", null, { eventId: "event-1" }),
    ]);
    expect(create).toHaveBeenCalledTimes(2);
    expect(results.map((result) => result.source)).toEqual(["ai", "ai", "keywords"]);
    expect(results[2].topics).toContain("design");
  });

  it("falls back when a provider call hangs past the shared join AbortSignal budget", async () => {
    create.mockImplementationOnce((_body: unknown, options?: { signal?: AbortSignal }) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }));
    admin.mockReturnValue({ rpc: vi.fn(async () => ({ data: true, error: null })) });
    const result = await extract("Building a podcast and looking for founders", null, {
      eventId: "event-2",
      signal: AbortSignal.timeout(10),
    });
    expect(create).toHaveBeenCalledOnce();
    expect(result.source).toBe("keywords");
    expect(result.offers).toContain("podcasting");
  });

  it("enforces the configurable per-event daily ceiling", async () => {
    vi.stubEnv("AI_EVENT_DAILY_CALL_LIMIT", "1");
    admin.mockReturnValue({ rpc: vi.fn(async (_name: string, { p_key }: { p_key: string }) => ({
      data: !p_key.startsWith("ai:event:") || ++eventCalls <= 1,
      error: null,
    })) });
    expect(await aiCallAllowed("event-cap")).toBe(true);
    expect(await aiCallAllowed("event-cap")).toBe(false);
    vi.unstubAllEnvs();
  });
});
