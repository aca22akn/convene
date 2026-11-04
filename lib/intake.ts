// Bulk intake used by the Luma import and the seed script: extract tags, link to a community person, insert.
import { admin } from "./db";
import { extract, pool } from "./extract";
import { personKey, upsertPerson } from "./people";
import type { JoinInput } from "./types";

export type IntakeRow = JoinInput & { person_key?: string | null; is_sample?: boolean };

export async function insertMembers(
  ev: { id: string; community_id: string | null },
  rows: IntakeRow[],
  concurrency = 4,
  options: { maxMembers?: number; signal?: AbortSignal; aiEnabled?: boolean } = {},
): Promise<{ imported: string[]; failed: { row: number; reason: string }[]; skipped_full: number; extraction: ("grok" | "keywords")[] }> {
  const db = admin();
  const { count, error: countError } = await db.from("members").select("id", { count: "exact", head: true }).eq("event_id", ev.id);
  if (countError) throw countError;
  const configuredCap = Number(process.env.MAX_MEMBERS_PER_EVENT);
  const cap = options.maxMembers ?? (Number.isSafeInteger(configuredCap) && configuredCap > 0 ? configuredCap : 200);
  const remaining = Math.max(0, cap - (count ?? 0));
  const selected = rows.slice(0, remaining);
  const settled = await pool(selected, concurrency, async (r) => {
    const tags = await extract(r.line, r.speak_on, { eventId: ev.id, signal: options.signal, enabled: options.aiEnabled !== false && !r.ai_opt_out });
    let person_id: string | null = null;
    const key = r.person_key ?? personKey(r);
    if (ev.community_id && key) person_id = await upsertPerson(ev.community_id, key, r.name).catch(() => null);
    const { data, error } = await db
      .from("members")
      .insert({
        event_id: ev.id,
        person_id,
        name: r.name,
        line: r.line,
        x_handle: r.x_handle?.replace(/^@+/, "") || null,
        speak_on: r.speak_on || null,
        contact: r.contact_consent ? r.contact || null : null,
        contact_consent: !!(r.contact_consent && r.contact),
        directory_consent: !!r.directory_consent,
        ai_opt_out: !!r.ai_opt_out,
        offers: tags.offers,
        seeks: tags.seeks,
        topics: tags.topics,
        speak_topics: tags.speak_topics,
        is_sample: !!r.is_sample,
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: data.id as string, source: tags.source };
  });
  return {
    imported: settled.filter((result): result is Extract<typeof result, { ok: true }> => result.ok).map((result) => result.value.id),
    failed: settled.flatMap((result, index) => result.ok ? [] : [{ row: index + 1, reason: result.error instanceof Error ? result.error.message : "row import failed" }]),
    skipped_full: rows.length - selected.length,
    extraction: settled.flatMap((result) => result.ok ? [result.value.source] : []),
  };
}
