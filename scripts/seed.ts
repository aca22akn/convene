// npm run seed — loads data/sample_members.json into a "demo" community with two events.
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { admin } from "../lib/db";
import { hashToken } from "../lib/auth";
import { insertMembers } from "../lib/intake";
import { recompute } from "../lib/recompute";

type Sample = { sample_id: number; name: string; line: string; speak_on?: string | null };

async function upsertEvent(db: ReturnType<typeof admin>, communityId: string, slug: string, name: string) {
  const { data, error } = await db
    .from("events")
    .upsert({ slug, name, community_id: communityId, admin_token_hash: hashToken(randomBytes(32).toString("base64url")) }, { onConflict: "slug" })
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
  const tokenHash = token ? hashToken(token) : undefined;
  const { data: existingCommunity, error: lookupError } = await db
    .from("communities")
    .select("id,admin_token_hash")
    .eq("slug", "demo")
    .maybeSingle();
  if (lookupError) throw lookupError;
  const generatedCommunityToken = !token && !existingCommunity?.admin_token_hash
    ? randomBytes(32).toString("base64url")
    : undefined;
  const communityTokenHash = tokenHash ?? existingCommunity?.admin_token_hash ?? hashToken(generatedCommunityToken ?? randomBytes(32).toString("base64url"));
  const file = JSON.parse(readFileSync(path.join(process.cwd(), "data/sample_members.json"), "utf8"));
  const samples: Sample[] = file.members;

  const { data: community, error } = await db
    .from("communities")
    .upsert({ slug: "demo", name: "Demo Community", admin_token_hash: communityTokenHash }, { onConflict: "slug" })
    .select("id")
    .single();
  if (error) throw error;
  if (token) {
    console.log("Seeded demo access uses the supplied ADMIN_TOKEN as a community token; its value is not printed and Supabase stores only its hash.");
  } else if (generatedCommunityToken) {
    console.log(`New demo community organiser token (shown once; save it now): ${generatedCommunityToken}`);
  } else {
    console.log("Existing demo community token hash was preserved. Its value is not recoverable from Supabase; set ADMIN_TOKEN to rotate it.");
  }

  const toRow = (s: Sample) => ({
    name: s.name, line: s.line, speak_on: s.speak_on ?? null, x_handle: null, contact: null,
    contact_consent: false, directory_consent: true, is_sample: true, person_key: `sample:${s.sample_id}`,
  });

  // A past event first, so community memory shows "seen at 2 events".
  const sept = await upsertEvent(db, community.id, "demo-sept", "Demo Meetup (September)");
  const septIds = await insertMembers(sept, samples.filter((s) => s.sample_id % 4 === 1).slice(0, 8).map(toRow));
  await db.from("events").update({ created_at: "2026-09-24T18:30:00Z" }).eq("id", sept.id);
  await recompute(sept.id);
  console.log(`demo-sept: ${septIds.imported.length} members`);

  const ev = await upsertEvent(db, community.id, "demo", "Demo Night");
  const t0 = Date.now();
  const ids = await insertMembers(ev, samples.map(toRow));
  const intros = await recompute(ev.id);
  console.log(`demo: ${ids.imported.length} members, ${intros.length} new intros in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
