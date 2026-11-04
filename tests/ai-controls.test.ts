import { beforeEach, describe, expect, it, vi } from "vitest";

const { aiCallAllowed, create, grok } = vi.hoisted(() => ({
  aiCallAllowed: vi.fn(async () => true),
  create: vi.fn(),
  grok: vi.fn(() => ({ chat: { completions: { create } } })),
}));
vi.mock("@/lib/ai-budget", () => ({ aiCallAllowed }));
vi.mock("@/lib/grok", () => ({ grok, GROK_MODEL: "test-model" }));

import { extract } from "@/lib/extract";
import { rerank } from "@/lib/rerank";
import { rerankCandidates } from "@/lib/recompute";
import { JoinInput, type Member } from "@/lib/types";

function member(id: string, aiOptOut = false): Member {
  return {
    id, event_id: "event-1", name: `Person ${id}`, line: `Building a tool ${id}`, ai_opt_out: aiOptOut,
    contact_consent: false, directory_consent: false, offers: [], seeks: [], topics: [], speak_topics: [], is_sample: false,
    created_at: "2026-11-04T12:00:00.000Z",
  };
}

describe("per-event and per-attendee AI controls", () => {
  beforeEach(() => {
    grok.mockClear();
    create.mockReset();
    aiCallAllowed.mockReset().mockResolvedValue(true);
  });

  it("parses an explicit attendee opt-out and defaults it to false", () => {
    const base = { name: "Ada", line: "Building a useful collaborative tool" };
    expect(JoinInput.parse(base).ai_opt_out).toBe(false);
    expect(JoinInput.parse({ ...base, ai_opt_out: true }).ai_opt_out).toBe(true);
    expect(JoinInput.safeParse({ ...base, surprise: true }).success).toBe(false);
  });

  it("does not create an xAI client call when the event or attendee disables AI", async () => {
    const result = await extract("Building a design tool", null, { eventId: "event-1", enabled: false });
    expect(grok).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(result.source).toBe("keywords");
  });

  it("does not rerank when the event AI flag is off", async () => {
    const result = await rerank(member("subject"), [member("candidate")], { eventId: "event-1", enabled: false });
    expect(result).toBeNull();
    expect(grok).not.toHaveBeenCalled();
    expect(aiCallAllowed).not.toHaveBeenCalled();
  });

  it("uses tag-only matching for opted-out subjects and excludes opted-out candidates from rerank", () => {
    const rows = [member("new"), member("opted", true), member("eligible")];
    expect(rerankCandidates(rows, [], "opted")).toEqual([]);
    expect(rerankCandidates(rows, [], "new").map((row) => row.id)).toEqual(["eligible"]);
  });
});
