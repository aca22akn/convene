import { afterAll, describe, expect, it } from "vitest";
import { notifyEvent } from "@/lib/realtime";
import { anon, createCommunity, createEvent, service, waitForBroadcast } from "./helpers";

const apiUrl = process.env.API_URL;
const anonKey = process.env.ANON_KEY;

if (!apiUrl || !anonKey) {
  throw new Error("Local Supabase integration tests require API_URL and ANON_KEY.");
}

const communityIds: string[] = [];

afterAll(async () => {
  if (communityIds.length === 0) return;
  const { error } = await service.from("communities").delete().in("id", communityIds);
  if (error) throw error;
});

describe("public data boundaries", () => {
  it("denies anon table reads and REST reads for all private application tables", async () => {
    for (const table of ["communities", "events", "people", "members", "intros", "access_tokens"] as const) {
      const { error } = await anon.from(table).select("*").limit(1);
      expect(error, `anon SELECT on ${table}`).not.toBeNull();
      expect(error?.message).toMatch(/permission|privilege|not allowed|forbidden/i);
    }

    const response = await fetch(new URL("/rest/v1/members?select=name,line,x_handle", apiUrl), {
      headers: { apikey: anonKey, authorization: `Bearer ${anonKey}` },
    });
    expect([401, 403]).toContain(response.status);
    expect(await response.text()).toMatch(/permission|privilege|not allowed|forbidden/i);
  });

  it("lets anon clients receive private event broadcasts but denies client sends", async () => {
    const community = await createCommunity();
    communityIds.push(community.id);
    const event = await createEvent(community.id);

    const received = await waitForBroadcast(`event:${event.id}`, "changed", () => notifyEvent(event.id));
    expect(received).toMatchObject({ payload: {} });

    const channel = anon.channel(`event:${event.id}`, { config: { private: true } });
    try {
      await expect(channel.httpSend("changed", { injected: true })).rejects.toThrow(/permission|not allowed|forbidden|unauthorized/i);
    } finally {
      await anon.removeChannel(channel);
    }
  });
});
