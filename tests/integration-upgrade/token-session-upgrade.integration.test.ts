import { describe, expect, it } from "vitest";
import { hashToken, resolveAdminToken } from "@/lib/auth";
import { service } from "../integration/helpers";

const communityToken = "local-migration-fixture-community-token";
const eventToken = "local-migration-fixture-event-token";
const duplicateEventToken = "local-migration-fixture-duplicate-event-token";

describe("token expand migration upgrade path", () => {
  it("backfills legacy tokens, resolves their original scopes, and clears reused event scopes", async () => {
    const { data: community, error: communityError } = await service
      .from("communities")
      .select("id,admin_token_hash")
      .eq("slug", "migration-upgrade-fixture")
      .single();
    if (communityError) throw communityError;

    const { data: sharedEvents, error: sharedEventsError } = await service
      .from("events")
      .select("id,admin_token_hash")
      .eq("community_id", community.id)
      .in("slug", ["migration-upgrade-shared-a", "migration-upgrade-shared-b"]);
    if (sharedEventsError) throw sharedEventsError;

    const { data: scopedEvent, error: scopedEventError } = await service
      .from("events")
      .select("id,community_id,admin_token_hash")
      .eq("slug", "migration-upgrade-event")
      .single();
    if (scopedEventError) throw scopedEventError;

    const { data: duplicateEvents, error: duplicateEventsError } = await service
      .from("events")
      .select("id,admin_token_hash")
      .in("slug", ["migration-upgrade-duplicate-a", "migration-upgrade-duplicate-b"])
      .order("id");
    if (duplicateEventsError) throw duplicateEventsError;

    expect(community.admin_token_hash).toBe(hashToken(communityToken));
    expect(sharedEvents).toHaveLength(2);
    expect(sharedEvents?.every((event) => event.admin_token_hash === null)).toBe(true);
    expect(scopedEvent.admin_token_hash).toBe(hashToken(eventToken));
    expect(duplicateEvents).toHaveLength(2);
    expect(duplicateEvents?.[0]).toMatchObject({
      id: "10000000-0000-4000-8000-000000000001",
      admin_token_hash: hashToken(duplicateEventToken),
    });
    expect(duplicateEvents?.[1]).toMatchObject({
      id: "10000000-0000-4000-8000-000000000002",
      admin_token_hash: null,
    });

    await expect(resolveAdminToken(communityToken)).resolves.toMatchObject({
      scope: { type: "community", communityId: community.id },
      kind: "admin",
    });
    await expect(resolveAdminToken(eventToken)).resolves.toMatchObject({
      scope: { type: "event", eventId: scopedEvent.id, communityId: scopedEvent.community_id },
      kind: "admin",
    });
    await expect(resolveAdminToken(duplicateEventToken)).resolves.toMatchObject({
      scope: { type: "event", eventId: "10000000-0000-4000-8000-000000000001", communityId: community.id },
      kind: "admin",
    });
  });
});
