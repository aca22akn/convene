import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { vi } from "vitest";
import { createCommunity, createEvent, service } from "./helpers";

vi.mock("next/server", () => ({ after: () => undefined }));

import { POST as join } from "@/app/api/e/[slug]/join/route";
import { POST as importCsv } from "@/app/api/e/[slug]/import/route";
import { hashToken } from "@/lib/auth";

describe("Postgres abuse controls", () => {
  const communityIds: string[] = [];
  const rateKeys: string[] = [];

  afterAll(async () => {
    if (communityIds.length) {
      const { error } = await service.from("communities").delete().in("id", communityIds);
      if (error) throw error;
    }
    if (rateKeys.length) {
      const { error } = await service.from("rate_limits").delete().in("key", rateKeys);
      if (error) throw error;
    }
  });

  it("allows exactly ten of fifty parallel hits in a fixed window", async () => {
    const key = `integration-rate:${randomUUID()}`;
    rateKeys.push(key);
    const hits = await Promise.all(Array.from({ length: 50 }, () => service.rpc("rate_limit_hit", {
      p_key: key,
      p_limit: 10,
      p_window_seconds: 3600,
    })));
    for (const hit of hits) expect(hit.error).toBeNull();
    expect(hits.filter((hit) => hit.data === true)).toHaveLength(10);
    expect(hits.filter((hit) => hit.data === false)).toHaveLength(40);
  });

  it("serializes concurrent member inserts at the configured event cap", async () => {
    const community = await createCommunity();
    communityIds.push(community.id);
    const event = await createEvent(community.id, service, 20);
    const attempts = await Promise.all(Array.from({ length: 30 }, (_, index) => service
      .from("members")
      .insert({ event_id: event.id, name: `Concurrent ${index}`, line: "Building a concurrent room cap test" })
      .select("id")
      .single()));
    expect(attempts.filter((result) => !result.error)).toHaveLength(20);
    expect(attempts.filter((result) => result.error?.message.includes("room_full"))).toHaveLength(10);
    const { count, error } = await service.from("members").select("id", { count: "exact", head: true }).eq("event_id", event.id);
    expect(error).toBeNull();
    expect(count).toBe(20);
  });

  it("returns exactly twenty successful concurrent join responses and ten room_full responses", async () => {
    const community = await createCommunity();
    communityIds.push(community.id);
    const event = await createEvent(community.id, service, 20);
    const responses = await Promise.all(Array.from({ length: 30 }, (_, index) => join(new Request(`http://127.0.0.1/api/e/${event.slug}/join`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-vercel-forwarded-for": `192.0.2.${index + 1}` },
      body: JSON.stringify({ name: `Attendee ${index}`, line: "Building a useful tool for growing teams" }),
    }), { params: Promise.resolve({ slug: event.slug }) })));
    expect(responses.filter((response) => response.status === 200)).toHaveLength(20);
    const full = responses.filter((response) => response.status === 409);
    expect(full).toHaveLength(10);
    for (const response of full) expect(await response.json()).toEqual({ error: "room_full" });
  });

  it("imports only the remaining room slots and reports skipped_full", async () => {
    const community = await createCommunity();
    communityIds.push(community.id);
    const event = await createEvent(community.id, service, 20);
    for (let index = 0; index < 5; index += 1) {
      const { error } = await service.from("members").insert({
        event_id: event.id,
        name: `Existing ${index}`,
        line: "Building a product for collaborative teams",
      });
      if (error) throw error;
    }
    const token = `integration-token-${randomUUID()}`;
    const { error: tokenError } = await service.from("events").update({ admin_token_hash: hashToken(token) }).eq("id", event.id);
    if (tokenError) throw tokenError;
    const csv = [
      "name,email,What are you building and what do you need?",
      ...Array.from({ length: 30 }, (_, index) => `Imported ${index},,Building a useful service for local teams`),
    ].join("\n");
    const response = await importCsv(new Request(`http://127.0.0.1/api/e/${event.slug}/import`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "text/csv" },
      body: csv,
    }), { params: Promise.resolve({ slug: event.slug }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ imported: 15, skipped_full: 15 });
    const { count, error: countError } = await service.from("members").select("id", { count: "exact", head: true }).eq("event_id", event.id);
    expect(countError).toBeNull();
    expect(count).toBe(20);
  });
});
