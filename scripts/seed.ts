// npm run seed — loads data/sample_members.json into a "demo" community with two events.
import { readFileSync } from "node:fs";
import path from "node:path";
import { admin } from "../lib/db";
import { insertMembers } from "../lib/intake";
import { recompute } from "../lib/recompute";

type Sample = { sample_id: number; name: string; line: string; speak_on?: string | null };

async function upsertEvent(db: ReturnType<typeof admin>, communityId: string, slug: string, name: string, token?: string) {
  const { data, error } = await db
    .from("events")
    .upsert({ slug, name, community_id: communityId, ...(token ? { admin_token: token } : {}) }, { onConflict: "slug" })
    .select("id,community_id")
    .single();
  if (error) throw error;
  await db.from("intros").delete().eq("event_id", data.id);
  await db.from("members").delete().eq("event_id", data.id);
  return data as { id: string; community_id: string };
}

async function main() {
  const db = admin();
  const token = process.env.ADMIN_TOKEN || undefined;
  const file = JSON.parse(readFileSync(path.join(process.cwd(), "data/sample_members.json"), "utf8"));
  const samples: Sample[] = file.members;

  const { data: community, error } = await db
    .from("communities")
    .upsert({ slug: "demo", name: "Demo Community", ...(token ? { admin_token: token } : {}) }, { onConflict: "slug" })
    .select("id")
    .single();
  if (error) throw error;

  const toRow = (s: Sample) => ({
    name: s.name, line: s.line, speak_on: s.speak_on ?? null, x_handle: null, contact: null,
    contact_consent: false, is_sample: true, person_key: `sample:${s.sample_id}`,
  });

  // A past event first, so community memory shows "seen at 2 events".
  const sept = await upsertEvent(db, community.id, "demo-sept", "Demo Meetup (September)", token);
  const septIds = await insertMembers(sept, samples.filter((s) => s.sample_id % 4 === 1).slice(0, 8).map(toRow));
  await db.from("events").update({ created_at: "2026-09-24T18:30:00Z" }).eq("id", sept.id);
  await recompute(sept.id);
  console.log(`demo-sept: ${septIds.length} members`);

  const ev = await upsertEvent(db, community.id, "demo", "Demo Night", token);
  const t0 = Date.now();
  const ids = await insertMembers(ev, samples.map(toRow));
  const intros = await recompute(ev.id);
  console.log(`demo: ${ids.length} members, ${intros.length} new intros in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(token ? "Admin token: ADMIN_TOKEN from .env.local" : "Admin token: see communities.admin_token in Supabase");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
