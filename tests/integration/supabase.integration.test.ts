import { afterAll, describe, expect, it } from "vitest";
import { createCommunity, createEvent, createMember, service } from "./helpers";

describe("local Supabase integration", () => {
  const communityIds: string[] = [];

  afterAll(async () => {
    if (communityIds.length === 0) return;
    const { error } = await service.from("communities").delete().in("id", communityIds);
    if (error) throw error;
  });

  it("creates and reads a community, event, and member through the service role", async () => {
    const community = await createCommunity();
    communityIds.push(community.id);
    const event = await createEvent(community.id);
    const member = await createMember(event.id);

    const { data, error } = await service
      .from("members")
      .select("id,event_id,name,line")
      .eq("id", member.id)
      .single();

    expect(error).toBeNull();
    expect(data).toEqual({
      id: member.id,
      event_id: event.id,
      name: "Test Member",
      line: "Building tests and looking for collaborators",
    });
  });
});
