import { admin } from "@/lib/db";
import { bad, eventMembers, getEvent, json, rankSpeakers, tagCounts, tokenOk } from "@/lib/api";


export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const token = new URL(req.url).searchParams.get("token");
  const ev = await getEvent(slug);
  if (!ev) return bad("event not found", 404);
  if (!(await tokenOk(ev, token))) return bad("unauthorized", 401);
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
    event: { id: ev.id, name: ev.name, slug: ev.slug, community_slug: community.data?.slug ?? null, community_name: community.data?.name ?? null },
    members,
    intros: intros.data ?? [],
    needs,
    offers,
    unmet,
    speakers,
    consenting_contacts: members.filter((m) => m.contact_consent).length,
  });
}
