import { authorizeEventRequest } from "@/lib/auth";
import { bad, getEvent, json } from "@/lib/api";
import { insertMembers } from "@/lib/intake";
import { parseLumaCsv } from "@/lib/luma";
import { personKey } from "@/lib/people";
import { notifyEvent } from "@/lib/realtime";
import { recompute } from "@/lib/recompute";

export const maxDuration = 60;

/** Import a Luma guest CSV export (body = raw CSV text). */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const ev = await getEvent(slug);
  if (!ev) return bad("event not found", 404);
  const access = await authorizeEventRequest(req, ev, { stateChanging: true });
  if (access.status !== 200) return bad(access.status === 403 ? "origin mismatch" : "unauthorized", access.status);
  const csv = await req.text();
  if (!csv.trim()) return bad("empty CSV");
  const { guests, lineColumn, speakColumn } = parseLumaCsv(csv);
  if (!lineColumn) return bad("no free-text question column found in this CSV");
  // Key community memory on the email/phone from Luma, but do not keep the contact (no consent from our form).
  const rows = guests.slice(0, 300).map((g) => ({ ...g, person_key: personKey(g) }));
  const ids = await insertMembers(ev, rows, 6);
  await notifyEvent(ev.id).catch((e) => console.error("[import] realtime notify failed", e));
  await recompute(ev.id).catch((e) => console.error("[import] recompute failed", e));
  return json({ imported: ids.length, line_column: lineColumn, speak_column: speakColumn });
}
