import { describe, expect, it } from "vitest";
import { loadCommunityRows, suggestIntros } from "@/lib/mcpTools";
import { createCommunity, createEvent, service } from "./helpers";

describe("local Supabase privacy controls", () => {
  it("stores event AI policy and attendee opt-out and filters LLM-bound MCP data", async () => {
    const community = await createCommunity();
    const enabledEvent = await createEvent(community.id, service, 200, true);
    const disabledEvent = await createEvent(community.id);
    const { data: eligible, error: eligibleError } = await service.from("members").insert({
      event_id: enabledEvent.id, name: "Eligible", line: "Building a public analytics tool",
    }).select("id,ai_opt_out").single();
    if (eligibleError) throw eligibleError;
    const { data: optedOut, error: optedError } = await service.from("members").insert({
      event_id: enabledEvent.id, name: "Opted Out", line: "Do not send this line to external AI", ai_opt_out: true,
    }).select("id,ai_opt_out").single();
    if (optedError) throw optedError;
    const { error: disabledError } = await service.from("members").insert({
      event_id: disabledEvent.id, name: "AI Disabled Event", line: "This row belongs to an AI-disabled event",
    });
    if (disabledError) throw disabledError;
    const [a, b] = [eligible.id, optedOut.id].sort();
    const { error: introError } = await service.from("intros").insert({
      event_id: enabledEvent.id, a_id: a, b_id: b, score: 1,
      reasons: [{ text: "Do not disclose", quote: "Do not send this line", grounded: true }],
    });
    if (introError) throw introError;

    expect(eligible.ai_opt_out).toBe(false);
    expect(optedOut.ai_opt_out).toBe(true);
    const rows = await loadCommunityRows(community.id, { aiEnabledOnly: true, excludeAiOptOut: true });
    expect(rows.map((row) => row.id)).toEqual([eligible.id]);
    const suggestions = await suggestIntros(community.id, eligible.id, {
      eventIds: [enabledEvent.id], aiEnabledOnly: true, excludeAiOptOut: true,
    });
    expect(suggestions.existing_intros).toEqual([]);

    const { error: cleanupError } = await service.from("communities").delete().eq("id", community.id);
    if (cleanupError) throw cleanupError;
  });
});
