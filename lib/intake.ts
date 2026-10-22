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
): Promise<string[]> {
  const db = admin();
  return pool(rows, concurrency, async (r) => {
    const tags = await extract(r.line, r.speak_on);
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
        offers: tags.offers,
        seeks: tags.seeks,
        topics: tags.topics,
        speak_topics: tags.speak_topics,
        is_sample: !!r.is_sample,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  });
}
