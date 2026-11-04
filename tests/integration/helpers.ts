import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const apiUrl = process.env.API_URL;
const anonKey = process.env.ANON_KEY;
const serviceRoleKey = process.env.SERVICE_ROLE_KEY;

if (!apiUrl || !anonKey || !serviceRoleKey) {
  throw new Error("Local Supabase integration tests require API_URL, ANON_KEY, and SERVICE_ROLE_KEY.");
}

const hostname = new URL(apiUrl).hostname;
if (!["127.0.0.1", "localhost", "::1"].includes(hostname)) {
  throw new Error("Integration tests are restricted to a local Supabase API URL.");
}

export const anon = createClient(apiUrl, anonKey, { auth: { persistSession: false } });
export const service = createClient(apiUrl, serviceRoleKey, { auth: { persistSession: false } });

export async function createCommunity(client: SupabaseClient = service) {
  const slug = `integration-${randomUUID()}`;
  const { data, error } = await client
    .from("communities")
    .insert({ slug, name: "Integration test community" })
    .select("id,slug,name")
    .single();
  if (error) throw error;
  return data;
}

export async function createEvent(communityId: string, client: SupabaseClient = service, memberCap = 200) {
  const slug = `integration-${randomUUID()}`;
  const { data, error } = await client
    .from("events")
    .insert({ slug, name: "Integration test event", community_id: communityId, member_cap: memberCap })
    .select("id,slug,name,community_id,member_cap")
    .single();
  if (error) throw error;
  return data;
}

export async function createMember(eventId: string, client: SupabaseClient = service) {
  const { data, error } = await client
    .from("members")
    .insert({ event_id: eventId, name: "Test Member", line: "Building tests and looking for collaborators" })
    .select("id,event_id,name,line")
    .single();
  if (error) throw error;
  return data;
}

/** Subscribe before invoking `trigger`, then resolve with the first event or reject after timeout. */
export async function waitForBroadcast<T>(
  topic: string,
  event: string,
  trigger: () => Promise<T>,
  timeoutMs = 3000,
): Promise<unknown> {
  const client = createClient(apiUrl!, anonKey!, { auth: { persistSession: false } });
  const channel = client.channel(topic, { config: { private: true, broadcast: { self: false } } });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const received = new Promise<unknown>((resolve, reject) => {
      channel.on("broadcast", { event }, (payload) => resolve(payload));
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void trigger().catch(reject);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          reject(new Error(`Realtime subscription failed: ${status}`));
        }
      });
      timer = setTimeout(() => reject(new Error(`Timed out waiting for broadcast ${event} on ${topic}`)), timeoutMs);
    });
    return await received;
  } finally {
    if (timer) clearTimeout(timer);
    await client.removeChannel(channel);
  }
}
