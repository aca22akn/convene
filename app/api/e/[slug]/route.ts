import { admin } from "@/lib/db";
import { bad, getEvent, json, tokenOk } from "@/lib/api";


/** Delete all data for an event (members and intros cascade), plus people who no longer appear anywhere. */
export async function DELETE(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const token = new URL(req.url).searchParams.get("token");
  const ev = await getEvent(slug);
  if (!ev) return bad("event not found", 404);
  if (!(await tokenOk(ev, token))) return bad("unauthorized", 401);
  const db = admin();
  const { data: pids } = await db.from("members").select("person_id").eq("event_id", ev.id);
  const { error } = await db.from("events").delete().eq("id", ev.id);
  if (error) return bad(error.message, 500);
  const ids = [...new Set((pids ?? []).map((p) => p.person_id).filter(Boolean))] as string[];
  if (ids.length) {
    const { data: still } = await db.from("members").select("person_id").in("person_id", ids);
    const keep = new Set((still ?? []).map((s) => s.person_id));
    const orphan = ids.filter((i) => !keep.has(i));
    if (orphan.length) await db.from("people").delete().in("id", orphan);
  }
  return json({ deleted: true });
}
