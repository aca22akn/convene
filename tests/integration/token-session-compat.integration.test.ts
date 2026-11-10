import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { hashToken, resolveAdminToken } from "@/lib/auth";
import { createCommunity, createEvent, service } from "./helpers";

const communityIds: string[] = [];

afterAll(async () => {
  if (communityIds.length === 0) return;
  const { error } = await service.from("communities").delete().in("id", communityIds);
  if (error) throw error;
});

describe("token migration compatibility", () => {
  it("keeps old default-token inserts authenticating and clears plaintext for hash writes", async () => {
    // Old app behavior: omit admin_token and let the preserved database default create it.
    const legacyCommunity = await createCommunity();
    communityIds.push(legacyCommunity.id);
    const { data: legacyRow, error: legacyReadError } = await service
      .from("communities")
      .select("admin_token,admin_token_hash")
      .eq("id", legacyCommunity.id)
      .single();
    if (legacyReadError) throw legacyReadError;
    expect(legacyRow.admin_token).toEqual(expect.any(String));
    expect(legacyRow.admin_token_hash).toBe(hashToken(legacyRow.admin_token));
    expect(await resolveAdminToken(legacyRow.admin_token)).toMatchObject({
      scope: { type: "community", communityId: legacyCommunity.id },
    });

    // Old event creation also relies on the preserved database default.
    const legacyEvent = await createEvent(legacyCommunity.id);
    const { data: legacyEventRow, error: legacyEventReadError } = await service
      .from("events")
      .select("admin_token,admin_token_hash")
      .eq("id", legacyEvent.id)
      .single();
    if (legacyEventReadError) throw legacyEventReadError;
    expect(legacyEventRow.admin_token).toEqual(expect.any(String));
    expect(legacyEventRow.admin_token_hash).toBe(hashToken(legacyEventRow.admin_token));
    expect(await resolveAdminToken(legacyEventRow.admin_token)).toMatchObject({
      scope: { type: "event", eventId: legacyEvent.id },
    });

    // New app behavior: supplying a hash clears the default-generated plaintext value.
    const newCommunityToken = randomBytes(32).toString("base64url");
    const { data: newCommunity, error: newCommunityError } = await service
      .from("communities")
      .insert({
        slug: `integration-hash-${randomUUID()}`,
        name: "Integration hashed community",
        admin_token_hash: hashToken(newCommunityToken),
      })
      .select("id,admin_token,admin_token_hash")
      .single();
    if (newCommunityError) throw newCommunityError;
    communityIds.push(newCommunity.id);
    expect(newCommunity.admin_token).toBeNull();
    expect(newCommunity.admin_token_hash).toBe(hashToken(newCommunityToken));
    expect(await resolveAdminToken(newCommunityToken)).toMatchObject({
      scope: { type: "community", communityId: newCommunity.id },
    });

    const newEventToken = randomBytes(32).toString("base64url");
    const { data: newEvent, error: newEventError } = await service
      .from("events")
      .insert({
        slug: `integration-hash-${randomUUID()}`,
        name: "Integration hashed event",
        community_id: newCommunity.id,
        admin_token_hash: hashToken(newEventToken),
      })
      .select("id,admin_token,admin_token_hash")
      .single();
    if (newEventError) throw newEventError;
    expect(newEvent.admin_token).toBeNull();
    expect(newEvent.admin_token_hash).toBe(hashToken(newEventToken));
    expect(await resolveAdminToken(newEventToken)).toMatchObject({
      scope: { type: "event", eventId: newEvent.id },
    });

    // An explicit hash update must clear legacy plaintext even when its hash is unchanged.
    const { data: cleanedLegacy, error: updateError } = await service
      .from("communities")
      .update({ admin_token_hash: legacyRow.admin_token_hash })
      .eq("id", legacyCommunity.id)
      .select("admin_token,admin_token_hash")
      .single();
    if (updateError) throw updateError;
    expect(cleanedLegacy.admin_token).toBeNull();
    expect(cleanedLegacy.admin_token_hash).toBe(legacyRow.admin_token_hash);
    expect(await resolveAdminToken(legacyRow.admin_token)).toMatchObject({
      scope: { type: "community", communityId: legacyCommunity.id },
    });
  });
});
