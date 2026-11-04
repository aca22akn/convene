// Bulk intake used by the Luma import and the seed script: extract tags, link to a community person, insert.
import { admin } from "./db";
import { extract, pool } from "./extract";
import { personKey, upsertPerson } from "./people";
import type { JoinInput } from "./types";

export type IntakeRow = JoinInput & { person_key?: string | null; is_sample?: boolean; source_guest_id?: string; source_row?: number };

type IntakeOutcome = { id: string; source: "grok" | "keywords" | "skipped"; changed: boolean };
export type IntakeRowResult =
  | { row: number; ok: true; id: string; changed: boolean; extraction: IntakeOutcome["source"] }
  | { row: number; ok: false; error: string };

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return "row import failed";
}

export async function insertMembers(
  ev: { id: string; community_id: string | null },
  rows: IntakeRow[],
  concurrency = 4,
  options: { maxMembers?: number; signal?: AbortSignal; aiEnabled?: boolean } = {},
): Promise<{ imported: string[]; results: IntakeRowResult[]; failed: { row: number; reason: string }[]; skipped_full: number; extraction: ("grok" | "keywords")[] }> {
  const db = admin();
  const { count, error: countError } = await db.from("members").select("id", { count: "exact", head: true }).eq("event_id", ev.id);
  if (countError) throw countError;
  const configuredCap = Number(process.env.MAX_MEMBERS_PER_EVENT);
  const cap = options.maxMembers ?? (Number.isSafeInteger(configuredCap) && configuredCap > 0 ? configuredCap : 200);
  const sourceIds = [...new Set(rows.map((row) => row.source_guest_id).filter((id): id is string => !!id))];
  let existingBySource = new Map<string, Record<string, unknown>>();
  if (sourceIds.length) {
    const { data: existingRows, error: existingError } = await db.from("members")
      .select("id,source_guest_id,name,line,speak_on,x_handle,offers,seeks,topics,speak_topics")
      .eq("event_id", ev.id)
      .in("source_guest_id", sourceIds);
    if (existingError) throw existingError;
    existingBySource = new Map((existingRows ?? []).flatMap((row) => row.source_guest_id
      ? [[row.source_guest_id as string, row as Record<string, unknown>]]
      : []));
  }

  const uniqueRows = new Map<string, { row: IntakeRow; index: number }>();
  rows.forEach((row, index) => uniqueRows.set(row.source_guest_id ?? `row:${index}`, { row, index }));
  const selected: { row: IntakeRow; index: number }[] = [];
  let availableNewSlots = Math.max(0, cap - (count ?? 0));
  let skippedFull = 0;
  for (const item of uniqueRows.values()) {
    if (item.row.source_guest_id && existingBySource.has(item.row.source_guest_id)) selected.push(item);
    else if (availableNewSlots > 0) {
      selected.push(item);
      availableNewSlots -= 1;
    } else skippedFull += 1;
  }

  const extractionSources: ("grok" | "keywords")[] = [];
  const settled = await pool(selected, concurrency, async ({ row: r }) => {
    const existing = r.source_guest_id ? existingBySource.get(r.source_guest_id) : undefined;
    const lineChanged = !!existing && (existing.line !== r.line || (existing.speak_on ?? null) !== (r.speak_on ?? null));
    const unchanged = !!existing && existing.name === r.name && !lineChanged && (existing.x_handle ?? null) === (r.x_handle ?? null);
    if (unchanged) return { id: existing.id as string, source: "skipped" as const, changed: false };

    const tags = lineChanged || !existing
      ? await extract(r.line, r.speak_on, { eventId: ev.id, signal: options.signal, enabled: options.aiEnabled !== false && !r.ai_opt_out })
      : {
          offers: existing.offers as string[], seeks: existing.seeks as string[], topics: existing.topics as string[],
          speak_topics: existing.speak_topics as string[], source: "keywords" as const,
        };
    if (tags.source === "grok" || (!existing && tags.source === "keywords")) extractionSources.push(tags.source);
    let person_id: string | null = null;
    const key = r.person_key ?? personKey(r);
    if (ev.community_id && key) person_id = await upsertPerson(ev.community_id, key, r.name).catch(() => null);
    const memberData = {
      event_id: ev.id,
      person_id,
      source_guest_id: r.source_guest_id,
      name: r.name,
      line: r.line,
      x_handle: r.x_handle?.replace(/^@/, "") || null,
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
    };
    const updateData = Object.fromEntries(Object.entries(memberData).filter(([key]) => key !== "person_id"));
    const query = existing
      ? db.from("members").update(updateData).eq("id", existing.id)
      : db.from("members").insert(memberData);
    const { data, error } = await query.select("id").single();
    if (error) throw error;
    return { id: data.id as string, source: tags.source, changed: true };
  });
  const results: IntakeRowResult[] = settled.map((result, selectedIndex) => {
    const source = selected[selectedIndex]!;
    const rowNumber = source.row.source_row ?? source.index + 1;
    if (result.ok) return { row: rowNumber, ok: true, id: result.value.id, changed: result.value.changed, extraction: result.value.source };
    return { row: rowNumber, ok: false, error: errorMessage(result.error) };
  });
  const fullFailures = results.filter((result) => !result.ok && /room_full/i.test(result.error)).length;
  const failed = results.flatMap((result) => !result.ok && !/room_full/i.test(result.error)
    ? [{ row: result.row, reason: result.error }]
    : []);
  const imported = results.flatMap((result) => result.ok && result.changed ? [result.id] : []);
  return {
    imported,
    results,
    failed,
    skipped_full: skippedFull + fullFailures,
    extraction: extractionSources,
  };
}
