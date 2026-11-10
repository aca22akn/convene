import { admin } from "@/lib/db";
import { authorizeEventRequest } from "@/lib/auth";
import { bad, eventMembers, getEvent, json, rankSpeakers, tagCounts } from "@/lib/api";
import { z } from "zod";
import { bodyErrorResponse, readLimitedJson } from "@/lib/request-body";

const JoiningBody = z.object({ joins_closed: z.boolean() }).strict();

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const ev = await getEvent(slug);
  if (!ev) return bad("event not found", 404);
  const access = await authorizeEventRequest(req, ev);
  if (access.status !== 200) return bad("unauthorized", 401);
  const db = admin();
  const [members, intros, community] = await Promise.all([
    eventMembers(ev.id),
    db.from("intros").select("*").eq("event_id", ev.id).order("score", { ascending: false }),
    ev.community_id
      ? db.from("communities").select("slug,name").eq("id", ev.community_id).maybeSingle()
      : Promise.resolve({ data: null as { slug: string; name: string } | null }),
  ]);
  const { needs, offers, unmet } = tagCounts(members);
  const speakers = rankSpeakers(members, needs).map((m) => ({
    id: m.id, name: m.name, x_handle: m.x_handle, speak_on: m.speak_on, speak_topics: m.speak_topics, line: m.line, demand: m.demand,
  }));
  return json({
    event: { id: ev.id, name: ev.name, slug: ev.slug, ai_enabled: ev.ai_enabled === true, joins_closed: ev.joins_closed === true, community_slug: community.data?.slug ?? null, community_name: community.data?.name ?? null },
    members,
    intros: intros.data ?? [],
    needs,
    offers,
    unmet,
    speakers,
    consenting_contacts: members.filter((m) => m.contact_consent).length,
  });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const ev = await getEvent(slug);
  if (!ev) return bad("event not found", 404);
  const access = await authorizeEventRequest(req, ev, { stateChanging: true });
  if (access.status !== 200) return bad(access.status === 403 ? "origin mismatch" : "unauthorized", access.status);

  const raw = await readLimitedJson(req, 4 * 1024);
  if (!raw.ok) return bodyErrorResponse(raw);
  const parsed = JoiningBody.safeParse(raw.value);
  if (!parsed.success) return bad("invalid input");

  const { error } = await admin().from("events").update({ joins_closed: parsed.data.joins_closed }).eq("id", ev.id);
  if (error) return bad("could not update joining status", 500);
  return json({ joins_closed: parsed.data.joins_closed });
}
