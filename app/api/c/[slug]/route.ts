import { connection } from "next/server";
import { admin } from "@/lib/db";
import { bad, json } from "@/lib/api";
import { summarisePeople } from "@/lib/mcpTools";


/** Public community directory: one row per person with how many events they've attended. No contact details. */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  await connection();
  const { slug } = await ctx.params;
  const db = admin();
  const { data: c } = await db.from("communities").select("id,name").eq("slug", slug).maybeSingle();
  if (!c) return bad("community not found", 404);
  const { data: evs, error: eventsError } = await db
    .from("events")
    .select("id,slug,name,created_at")
    .eq("community_id", c.id)
    .order("created_at", { ascending: false });
  if (eventsError) return bad("failed to load community events", 500);

  const eventIds = (evs ?? []).map((e) => e.id as string);
  const eventSlug = new Map((evs ?? []).map((e) => [e.id as string, e.slug as string]));
  const { data: members, error: membersError } = eventIds.length
    ? await db
        .from("members")
        .select("id,event_id,person_id,name,line,x_handle,speak_on,offers,seeks,topics,speak_topics,contact_consent,is_sample,created_at,directory_consent")
        .in("event_id", eventIds)
        .eq("directory_consent", true)
        .order("created_at", { ascending: false })
    : { data: [], error: null };
  if (membersError) return bad("failed to load directory members", 500);

  const consentingRows = (members ?? [])
    .filter((member) => member.directory_consent === true)
    .map((member) => ({ ...member, event_slug: eventSlug.get(member.event_id as string) }));
  const people = summarisePeople(consentingRows)
    .sort((a, b) => b.events_count - a.events_count || a.name.localeCompare(b.name) || a.person_id.localeCompare(b.person_id))
    .map((p) => ({
      name: p.name, x_handle: p.x_handle, latest_line: p.line, speak_on: p.speak_on, events_count: p.events_count,
    }));

  const params = new URL(req.url).searchParams;
  const limitParam = params.get("limit");
  const cursorParam = params.get("cursor");
  let pagePeople = people;
  let nextCursor: string | null = null;
  if (limitParam !== null || cursorParam !== null) {
    const limit = limitParam === null ? Number.NaN : Number(limitParam);
    const offset = cursorParam === null ? 0 : Number(cursorParam);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0) {
      return bad("invalid pagination", 400);
    }
    pagePeople = people.slice(offset, offset + limit);
    nextCursor = offset + limit < people.length ? String(offset + limit) : null;
  }

  return json({
    community: { name: c.name },
    people: pagePeople,
    total: people.length,
    next_cursor: nextCursor,
  });
}
