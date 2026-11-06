import { authorizeEventRequest } from "@/lib/auth";
import { bad, getEvent, json } from "@/lib/api";
import { insertMembers } from "@/lib/intake";
import { parseLumaCsv } from "@/lib/luma";
import { personKey } from "@/lib/people";
import { notifyEvent } from "@/lib/realtime";
import { recompute } from "@/lib/recompute";
import { envLimit, limit } from "@/lib/ratelimit";
import { bodyErrorResponse, readLimitedText } from "@/lib/request-body";

export const maxDuration = 60;

/** Import a Luma guest CSV export (body = raw CSV text). */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const ev = await getEvent(slug);
  if (!ev) return bad("event not found", 404);
  const access = await authorizeEventRequest(req, ev, { stateChanging: true });
  if (access.status !== 200) return bad(access.status === 403 ? "origin mismatch" : "unauthorized", access.status);
  const limited = await limit(req, "import", { limit: envLimit("IMPORT_LIMIT", 6), windowSeconds: 3600, extraKey: ev.id });
  if (limited) return limited;
  const body = await readLimitedText(req, 1024 * 1024);
  if (!body.ok) return bodyErrorResponse(body);
  const csv = body.value;
  if (!csv.trim()) return bad("empty CSV");
  const { guests, lineColumn, speakColumn } = parseLumaCsv(csv);
  if (!lineColumn) return bad("no free-text question column found in this CSV");
  // Key community memory on the email/phone from Luma, but do not keep the contact (no consent from our form).
  const rows = guests.map((g) => ({ ...g, person_key: personKey(g) }));
  const aiEnabled = ev.ai_enabled === true && req.headers.get("x-ai-processing-acknowledged") === "true";
  const result = await insertMembers(ev, rows, 6, {
    maxMembers: ev.member_cap || envLimit("MAX_MEMBERS_PER_EVENT", 200),
    aiEnabled,
  });
  if (result.imported.length) {
    await notifyEvent(ev.id).catch((e) => console.error("[import] realtime notify failed", e));
    await recompute(ev.id, undefined, { aiEnabled }).catch((e) => console.error("[import] recompute failed", e));
  }
  return json({
    imported: result.imported.length,
    failed: result.failed,
    skipped_full: result.skipped_full,
    line_column: lineColumn,
    speak_column: speakColumn,
    ai_used: result.extraction.includes("ai"),
  });
}
