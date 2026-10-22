import { connection } from "next/server";
import { admin } from "@/lib/db";
import { bad, eventMembers, getEvent, json } from "@/lib/api";


/** Public live view for /stage: members (no contact) and intros. */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  await connection();
  const { slug } = await ctx.params;
  const ev = await getEvent(slug);
  if (!ev) return bad("event not found", 404);
  const db = admin();
  const [members, intros, community] = await Promise.all([
    eventMembers(ev.id),
    db.from("intros").select("*").eq("event_id", ev.id).order("created_at", { ascending: false }),
    ev.community_id
      ? db.from("communities").select("slug").eq("id", ev.community_id).maybeSingle()
      : Promise.resolve({ data: null as { slug: string } | null }),
  ]);
  return json({
    event: { id: ev.id, name: ev.name, slug: ev.slug, community_slug: community.data?.slug ?? null },
    count: members.length,
    members: members.map((m) => ({
      id: m.id, name: m.name, line: m.line, offers: m.offers, seeks: m.seeks, topics: m.topics,
      x_handle: m.x_handle, speak_on: m.speak_on, created_at: m.created_at,
    })),
    intros: intros.data ?? [],
  });
}
