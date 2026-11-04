import { timingSafeEqual } from "node:crypto";
import { admin } from "@/lib/db";
import { RETENTION_DAYS_DEFAULT } from "@/lib/privacy";

export function retentionCutoff(now: Date, days: number): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function authorized(req: Request): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  const match = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") ?? "");
  const supplied = match?.[1] ?? "";
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(supplied, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function retentionDays(): number {
  const value = Number(process.env.RETENTION_DAYS);
  return Number.isSafeInteger(value) && value > 0 ? value : RETENTION_DAYS_DEFAULT;
}

export async function runRetention(now = new Date()) {
  const db = admin();
  const cutoff = retentionCutoff(now, retentionDays());
  const { data: expired, error: expiredError } = await db.from("events").select("id").lt("created_at", cutoff);
  if (expiredError) throw expiredError;
  const eventIds = (expired ?? []).map((row) => row.id as string);
  let orphanPeople = 0;
  let deletedEvents = 0;
  if (eventIds.length) {
    const { data: memberRows, error: membersError } = await db.from("members").select("person_id").in("event_id", eventIds);
    if (membersError) throw membersError;
    const personIds = [...new Set((memberRows ?? []).map((row) => row.person_id).filter((id): id is string => typeof id === "string"))];
    const { data: deleted, error: deleteError } = await db.from("events").delete().in("id", eventIds).select("id");
    if (deleteError) throw deleteError;
    deletedEvents = deleted?.length ?? 0;
    if (personIds.length) {
      const { data: stillUsed, error: stillError } = await db.from("members").select("person_id").in("person_id", personIds);
      if (stillError) throw stillError;
      const activeIds = new Set((stillUsed ?? []).map((row) => row.person_id));
      const orphanIds = personIds.filter((id) => !activeIds.has(id));
      if (orphanIds.length) {
        const { data: removed, error: peopleError } = await db.from("people").delete().in("id", orphanIds).select("id");
        if (peopleError) throw peopleError;
        orphanPeople = removed?.length ?? 0;
      }
    }
  }
  const nowIso = now.toISOString();
  const { data: expiredTokens, error: tokenError } = await db.from("access_tokens").delete().lt("expires_at", nowIso).select("token_hash");
  if (tokenError) throw tokenError;
  const rateCutoff = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const { data: oldWindows, error: rateError } = await db.from("rate_limits").delete().lt("window_start", rateCutoff).select("key");
  if (rateError) throw rateError;
  return {
    deleted_events: deletedEvents,
    deleted_orphan_people: orphanPeople,
    deleted_tokens: expiredTokens?.length ?? 0,
    deleted_rate_windows: oldWindows?.length ?? 0,
  };
}

export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    return Response.json(await runRetention(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[retention] cleanup failed", error);
    return Response.json({ error: "retention_failed" }, { status: 500 });
  }
}
