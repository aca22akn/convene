import { beforeEach, describe, expect, it, vi } from "vitest";

const { admin, createMcpHandler, eventFilterForAuth, limit, resolveRequestAuth } = vi.hoisted(() => ({
  admin: vi.fn(),
  createMcpHandler: vi.fn(() => async () => Response.json({ ok: true })),
  eventFilterForAuth: vi.fn(() => ({ eventIds: ["event-1"] })),
  limit: vi.fn(async (): Promise<Response | null> => null),
  resolveRequestAuth: vi.fn(),
}));

vi.mock("mcp-handler", () => ({ createMcpHandler }));
vi.mock("@/lib/db", () => ({ admin }));
vi.mock("@/lib/auth", () => ({ eventFilterForAuth, resolveRequestAuth }));
vi.mock("@/lib/ratelimit", () => ({ limit, envLimit: (_name: string, fallback: number) => fallback }));
vi.mock("@/lib/mcpTools", () => ({ communityGaps: vi.fn(), findSpeakers: vi.fn(), searchMembers: vi.fn(), suggestIntros: vi.fn() }));

import { GET } from "@/app/api/mcp/route";

describe("MCP request rate limiting", () => {
  beforeEach(() => {
    createMcpHandler.mockClear();
    limit.mockReset().mockResolvedValue(null);
    resolveRequestAuth.mockReset().mockResolvedValue({ scope: { type: "event", eventId: "event-1", communityId: "community-1" }, via: "bearer", kind: "admin", llm: false });
    admin.mockReturnValue({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "event-1", name: "Demo", community_id: "community-1" }, error: null }) }) }) }) });
  });

  it("returns a scoped 429 with Retry-After before creating the MCP handler", async () => {
    limit.mockResolvedValueOnce(Response.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "30" } }));
    const response = await GET(new Request("http://localhost/api/mcp", { headers: { authorization: "Bearer test-token" } }));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("30");
    expect(limit).toHaveBeenCalledWith(expect.any(Request), "ask-minute", { limit: 5, windowSeconds: 60, extraKey: "event-1" });
    expect(createMcpHandler).not.toHaveBeenCalled();
  });
});
