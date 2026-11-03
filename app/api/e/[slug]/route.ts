import { admin } from "@/lib/db";
import { authorizeEventRequest } from "@/lib/auth";
import { bad, getEvent, json } from "@/lib/api";
import { notifyEvent } from "@/lib/realtime";


/** Delete all data for an event (members and intros cascade), plus people who no longer appear anywhere. */
export async function DELETE(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const ev = await getEvent(slug);
  if (!ev) return bad("event not found", 404);
  const access = await authorizeEventRequest(req, ev, { stateChanging: true });
  if (access.status !== 200) return bad(access.status === 403 ? "origin mismatch" : "unauthorized", access.status);
  const db = admin();
  const { data: pids } = await db.from("members").select("person_id").eq("event_id", ev.id);
  const { error } = await db.from("events").delete().eq("id", ev.id);
  if (error) return bad(error.message, 500);
  await notifyEvent(ev.id).catch((broadcastError) => console.error("[event delete] broadcast failed", broadcastError));
  const ids = [...new Set((pids ?? []).map((p) => p.person_id).filter(Boolean))] as string[];
  if (ids.length) {
    const { data: still } = await db.from("members").select("person_id").in("person_id", ids);
    const keep = new Set((still ?? []).map((s) => s.person_id));
    const orphan = ids.filter((i) => !keep.has(i));
    if (orphan.length) await db.from("people").delete().in("id", orphan);
  }
  return json({ deleted: true });
}
