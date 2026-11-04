import { after } from "next/server";
import { admin } from "@/lib/db";
import { bad, getEvent, json } from "@/lib/api";
import { extract } from "@/lib/extract";
import { personKey, upsertPerson } from "@/lib/people";
import { recompute } from "@/lib/recompute";
import { notifyEvent } from "@/lib/realtime";
import { JoinInput } from "@/lib/types";
import { envLimit, limit } from "@/lib/ratelimit";
import { bodyErrorResponse, readLimitedJson } from "@/lib/request-body";

export const maxDuration = 60;

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const ipLimited = await limit(req, "join-ip", { limit: envLimit("JOIN_IP_LIMIT", 8), windowSeconds: 600 });
  if (ipLimited) return ipLimited;
  const { slug } = await ctx.params;
  const ev = await getEvent(slug);
  if (!ev) return bad("event not found", 404);
  if (ev.joins_closed === true) return bad("doors are closed", 403);
  const eventLimited = await limit(req, "join-event", { limit: envLimit("JOIN_EVENT_LIMIT", 400), windowSeconds: 3600, extraKey: ev.id });
  if (eventLimited) return eventLimited;
  const raw = await readLimitedJson(req, 4 * 1024);
  if (!raw.ok) return bodyErrorResponse(raw);
  const parsed = JoinInput.safeParse(raw.value);
  if (!parsed.success) return bad("invalid input: " + parsed.error.issues.map((i) => i.path.join(".")).join(", "));
  const input = parsed.data;
  const x_handle = input.x_handle?.replace(/^@+/, "").trim() || null;
  const contact = input.contact?.trim() || null;

  const aiSignal = AbortSignal.timeout(25_000);
  const aiEnabled = ev.ai_enabled === true;
  const tags = await extract(input.line, input.speak_on, { eventId: ev.id, signal: aiSignal, enabled: aiEnabled && !input.ai_opt_out });
  let person_id: string | null = null;
  if (ev.community_id) {
    const key = personKey({ x_handle, contact });
    if (key) person_id = await upsertPerson(ev.community_id, key, input.name).catch(() => null);
  }
  const { data, error } = await admin()
    .from("members")
    .insert({
      event_id: ev.id,
      person_id,
      name: input.name,
      line: input.line,
      x_handle,
      speak_on: input.speak_on?.trim() || null,
      contact: input.contact_consent ? contact : null, // contact is only stored when they agreed to share it
      contact_consent: input.contact_consent && !!contact,
      directory_consent: input.directory_consent,
      ai_opt_out: input.ai_opt_out,
      offers: tags.offers,
      seeks: tags.seeks,
      topics: tags.topics,
      speak_topics: tags.speak_topics,
    })
    .select("id")
    .single();
  if (error) return error.message === "room_full" ? bad("room_full", 409) : bad(error.message, 500);
  const member_id = data.id as string;
  after(async () => {
    try {
      await notifyEvent(ev.id);
    } catch (e) {
      console.error("[join] realtime notify failed", e);
    }
    try {
      await recompute(ev.id, member_id, { signal: aiSignal, aiEnabled });
      await notifyEvent(ev.id);
    } catch (e) {
      console.error("[join] recompute or realtime notify failed", e);
    }
  });
  return json({ member_id, extraction: tags.source });
}
