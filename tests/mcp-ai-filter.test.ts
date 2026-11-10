import { beforeEach, describe, expect, it, vi } from "vitest";

const { admin } = vi.hoisted(() => ({ admin: vi.fn() }));
vi.mock("@/lib/db", () => ({ admin }));

import { searchMembers } from "@/lib/mcpTools";

describe("LLM MCP member filtering", () => {
  const rpc = vi.fn();

  beforeEach(() => {
    rpc.mockReset().mockResolvedValue({
      data: {
        total: 1,
        people: [{
          person_id: "person-ok", member_id: "member-ok", name: "Allowed", line: "Building tools",
          x_handle: null, speak_on: null, offers: [], seeks: [], speak_topics: [], events_count: 1,
          event_slugs: ["ai"],
        }],
      },
      error: null,
    });
    admin.mockReset().mockReturnValue({ rpc });
  });

  it("enforces AI-enabled event and attendee opt-out filters in the database query", async () => {
    const results = await searchMembers("community-1", "tools", {
      eventIds: ["event-ai"],
      aiEnabledOnly: true,
      excludeAiOptOut: true,
    });

    expect(results.map((person) => person.member_id)).toEqual(["member-ok"]);
    expect(rpc).toHaveBeenCalledWith("search_members", expect.objectContaining({
      p_community: "community-1",
      p_event_ids: ["event-ai"],
      p_ai_enabled_only: true,
      p_exclude_ai_opt_out: true,
    }));
  });
});
