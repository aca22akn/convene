import { beforeEach, describe, expect, it, vi } from "vitest";

const { admin } = vi.hoisted(() => ({ admin: vi.fn() }));
vi.mock("@/lib/db", () => ({ admin }));

import * as communityTools from "@/lib/mcpTools";

const person = {
  person_id: "person-1",
  member_id: "member-1",
  name: "Priya Raman",
  x_handle: null,
  line: "Building a Postgres tool",
  speak_on: "Postgres scaling",
  offers: ["databases"],
  seeks: ["design"],
  speak_topics: ["databases"],
  events_count: 1,
  event_slugs: ["makers-1"],
  created_at: "2026-11-01T12:00:00.000Z",
};

function query(data: unknown) {
  const result = { data, error: null };
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    or: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({ data: Array.isArray(data) ? data[0] : data, error: null })),
    then: (resolve: (value: typeof result) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

describe("bounded MCP community queries", () => {
  const rpc = vi.fn();
  const from = vi.fn();
  const scope = { eventIds: ["event-1"], aiEnabledOnly: true, excludeAiOptOut: true };

  beforeEach(() => {
    rpc.mockReset().mockImplementation(async (name: string) => {
      if (name === "community_gaps") return { data: { members: 1, gaps: [] }, error: null };
      if (name === "suggest_intro_candidates") {
        return { data: {
          member: { id: "member-1", name: "Priya Raman", line: "Building a Postgres tool" },
          candidates: [],
          existing_intros: [{ name: "Existing match", line: "Already introduced", score: 1, reasons: ["Shared goal"] }],
        }, error: null };
      }
      return { data: { people: [person], total: 1 }, error: null };
    });
    from.mockReset().mockImplementation(() => query([]));
    admin.mockReset().mockReturnValue({ rpc, from });
  });

  it("uses one bounded SQL query for each search, speaker, and gap tool", async () => {
    await communityTools.searchMembers("community-1", "postgres", scope);
    await communityTools.findSpeakers("community-1", "postgres", scope);
    await communityTools.communityGaps("community-1", scope);

    expect(rpc).toHaveBeenCalledTimes(3);
    expect(rpc).toHaveBeenNthCalledWith(1, "search_members", expect.objectContaining({
      p_community: "community-1", p_event_ids: ["event-1"], p_query: "postgres", p_limit: 50,
      p_ai_enabled_only: true, p_exclude_ai_opt_out: true,
    }));
    expect(rpc).toHaveBeenNthCalledWith(2, "search_members", expect.objectContaining({
      p_community: "community-1", p_event_ids: ["event-1"], p_query: "postgres", p_limit: 50,
      p_ai_enabled_only: true, p_exclude_ai_opt_out: true,
    }));
    expect(rpc).toHaveBeenNthCalledWith(3, "community_gaps", expect.objectContaining({
      p_community: "community-1", p_event_ids: ["event-1"],
      p_ai_enabled_only: true, p_exclude_ai_opt_out: true,
    }));
    expect(from).not.toHaveBeenCalled();
  });

  it("loads an Ask fallback context with one search query and one gaps query", async () => {
    const context = await communityTools.loadAskContext("community-1", "postgres", scope);

    expect(context.search_members).toHaveLength(1);
    expect(context.find_speakers).toHaveLength(1);
    expect(context.community_gaps).toEqual({ members: 1, gaps: [] });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(["search_members", "community_gaps"]);
    expect(from).not.toHaveBeenCalled();
  });

  it("loads the member, bounded candidates, and existing intros in one scoped query", async () => {
    const result = await communityTools.suggestIntros("community-1", "member-1", scope);

    expect(result).toMatchObject({
      member: { name: "Priya Raman" },
      suggestions: [],
      existing_intros: [{ name: "Existing match", line: "Already introduced", reasons: ["Shared goal"] }],
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("suggest_intro_candidates", expect.objectContaining({
      p_community: "community-1", p_event_ids: ["event-1"], p_member_id: "member-1", p_limit: 8,
      p_ai_enabled_only: true, p_exclude_ai_opt_out: true,
    }));
    expect(from).not.toHaveBeenCalled();
  });
});
