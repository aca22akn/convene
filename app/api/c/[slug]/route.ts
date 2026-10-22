import { connection } from "next/server";
import { admin } from "@/lib/db";
import { bad, json } from "@/lib/api";
import { loadCommunityRows, summarisePeople } from "@/lib/mcpTools";


/** Public community directory: one row per person with how many events they've attended. No contact details. */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  await connection();
  const { slug } = await ctx.params;
  const db = admin();
  const { data: c } = await db.from("communities").select("id,slug,name").eq("slug", slug).maybeSingle();
  if (!c) return bad("community not found", 404);
  const [rows, evs] = await Promise.all([
    loadCommunityRows(c.id),
    db.from("events").select("slug,name,created_at").eq("community_id", c.id).order("created_at", { ascending: false }),
  ]);
  const people = summarisePeople(rows)
    .sort((a, b) => b.events_count - a.events_count || a.name.localeCompare(b.name))
    .map((p) => ({
      person_id: p.person_id, member_id: p.member_id, name: p.name, x_handle: p.x_handle, latest_line: p.line,
      speak_on: p.speak_on, offers: p.offers, seeks: p.seeks, events_count: p.events_count, event_slugs: p.event_slugs,
    }));
  return json({ community: { name: c.name, slug: c.slug }, events: evs.data ?? [], people });
}
