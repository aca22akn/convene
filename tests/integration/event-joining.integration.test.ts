import { afterAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { createCommunity, createEvent, service } from "./helpers";

vi.mock("next/server", () => ({ after: () => undefined }));

import { PATCH as updateJoining } from "@/app/api/e/[slug]/organiser/route";
import { POST as join } from "@/app/api/e/[slug]/join/route";
import { hashToken } from "@/lib/auth";

describe("organiser controlled event joining", () => {
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

  it("closes joining through the organiser route and rejects new joins server-side", async () => {
    const community = await createCommunity();
    communityIds.push(community.id);
    const event = await createEvent(community.id);
    expect(event.joins_closed).toBe(false);

    const token = `integration-close-joining-${randomUUID()}`;
    const { error: tokenError } = await service
      .from("events")
      .update({ admin_token_hash: hashToken(token) })
      .eq("id", event.id);
    if (tokenError) throw tokenError;

    const update = await updateJoining(
      new Request(`http://127.0.0.1/api/e/${event.slug}/organiser`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ joins_closed: true }),
      }),
      { params: Promise.resolve({ slug: event.slug }) },
    );
    expect(update.status).toBe(200);
    expect(await update.json()).toEqual({ joins_closed: true });

    const hex = randomUUID().replaceAll("-", "");
    const ip = `198.51.${Number.parseInt(hex.slice(0, 2), 16)}.${Number.parseInt(hex.slice(2, 4), 16)}`;
    rateKeys.push(`join-ip:${ip}`);
    const response = await join(
      new Request(`http://127.0.0.1/api/e/${event.slug}/join`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-vercel-forwarded-for": ip },
        body: JSON.stringify({ name: "Late attendee", line: "Building a useful tool and looking for design feedback" }),
      }),
      { params: Promise.resolve({ slug: event.slug }) },
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "doors are closed" });

    const { count, error: countError } = await service
      .from("members")
      .select("id", { count: "exact", head: true })
      .eq("event_id", event.id);
    expect(countError).toBeNull();
    expect(count).toBe(0);
  });
});
