import { describe, expect, it } from "vitest";
import { hashToken } from "@/lib/auth";
import { runRetention } from "@/app/api/cron/retention/route";
import { createCommunity, createEvent, service } from "./helpers";

describe("retention cleanup in local Supabase", () => {
  it("removes expired events and orphan people, expired access tokens, and stale rate windows", async () => {
    const fakeNow = new Date("2026-11-04T12:00:00.000Z");
    const community = await createCommunity();
    const oldEvent = await createEvent(community.id);
    const currentEvent = await createEvent(community.id);
    const oldCreatedAt = new Date(fakeNow.getTime() - 366 * 24 * 60 * 60 * 1000).toISOString();
    const { error: updateError } = await service.from("events").update({ created_at: oldCreatedAt }).eq("id", oldEvent.id);
    if (updateError) throw updateError;
    const { data: person, error: personError } = await service.from("people").insert({ community_id: community.id, key: `retention:${oldEvent.id}`, name: "Expired person" }).select("id").single();
    if (personError) throw personError;
    const { error: memberError } = await service.from("members").insert({ event_id: oldEvent.id, person_id: person.id, name: "Expired attendee", line: "Building something for retention tests" });
    if (memberError) throw memberError;
    const { error: tokenError } = await service.from("access_tokens").insert({
      token_hash: hashToken(`expired:${oldEvent.id}`), token_type: "session", event_id: currentEvent.id,
      llm: false, expires_at: new Date(fakeNow.getTime() - 1000).toISOString(),
    });
    if (tokenError) throw tokenError;
    const staleWindow = new Date(fakeNow.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const { error: rateError } = await service.from("rate_limits").insert({ key: `retention:${oldEvent.id}`, window_start: staleWindow, count: 1 });
    if (rateError) throw rateError;

    await runRetention(fakeNow);

    const { data: removedEvent } = await service.from("events").select("id").eq("id", oldEvent.id).maybeSingle();
    const { data: keptEvent } = await service.from("events").select("id").eq("id", currentEvent.id).maybeSingle();
    const { data: removedPerson } = await service.from("people").select("id").eq("id", person.id).maybeSingle();
    const { data: removedToken } = await service.from("access_tokens").select("token_hash").eq("token_hash", hashToken(`expired:${oldEvent.id}`)).maybeSingle();
    const { data: removedWindow } = await service.from("rate_limits").select("key").eq("key", `retention:${oldEvent.id}`).maybeSingle();
    expect(removedEvent).toBeNull();
    expect(keptEvent).toMatchObject({ id: currentEvent.id });
    expect(removedPerson).toBeNull();
    expect(removedToken).toBeNull();
    expect(removedWindow).toBeNull();

    const { error: cleanupError } = await service.from("communities").delete().eq("id", community.id);
    if (cleanupError) throw cleanupError;
  });
});
