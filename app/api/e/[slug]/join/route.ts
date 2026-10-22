import { after } from "next/server";
import { admin } from "@/lib/db";
import { bad, getEvent, json } from "@/lib/api";
import { extract } from "@/lib/extract";
import { personKey, upsertPerson } from "@/lib/people";
import { recompute } from "@/lib/recompute";
import { JoinInput } from "@/lib/types";

export const maxDuration = 60;

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const ev = await getEvent(slug);
  if (!ev) return bad("event not found", 404);
  const parsed = JoinInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("invalid input: " + parsed.error.issues.map((i) => i.path.join(".")).join(", "));
  const input = parsed.data;
  const x_handle = input.x_handle?.replace(/^@+/, "").trim() || null;
  const contact = input.contact?.trim() || null;

  const tags = await extract(input.line, input.speak_on);
  let person_id: string | null = null;
  if (ev.community_id) {
    const key = personKey({ x_handle, contact });
    if (key) person_id = await upsertPerson(ev.community_id, key, input.name).catch(() => null);
  }
  const { data, error } = await admin()
    .from("members")
    .insert({
      event_id: ev.id,
      person_id,
      name: input.name,
      line: input.line,
      x_handle,
      speak_on: input.speak_on?.trim() || null,
      contact: input.contact_consent ? contact : null, // contact is only stored when they agreed to share it
      contact_consent: input.contact_consent && !!contact,
      offers: tags.offers,
      seeks: tags.seeks,
      topics: tags.topics,
      speak_topics: tags.speak_topics,
    })
    .select("id")
    .single();
  if (error) return bad(error.message, 500);
  const member_id = data.id as string;
  after(async () => {
    try {
      await recompute(ev.id, member_id);
    } catch (e) {
      console.error("[join] recompute failed", e);
    }
  });
  return json({ member_id, extraction: tags.source });
}
