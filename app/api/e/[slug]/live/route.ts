import { createHash } from "node:crypto";
import { connection } from "next/server";
import { admin } from "@/lib/db";
import { bad, getEvent } from "@/lib/api";
import { firstName, headlineQuote } from "@/lib/ui";
import { opaqueLiveMemberId } from "@/lib/public-id";

/** Public live view for /stage: members (no contact) and intros. */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  await connection();
  const { slug } = await ctx.params;
  const ev = await getEvent(slug);
  if (!ev) return bad("event not found", 404);
  const db = admin();
  const [memberResult, introResult] = await Promise.all([
    db.from("members").select("id,name,created_at").eq("event_id", ev.id).order("created_at", { ascending: true }),
    db.from("intros").select("a_id,b_id,created_at,reasons").eq("event_id", ev.id).order("created_at", { ascending: false }),
  ]);
  if (memberResult.error || introResult.error) return bad("failed to load live view", 500);

  const members = memberResult.data ?? [];
  const intros = introResult.data ?? [];
  const publicIds = new Map(members.map((member) => [member.id, opaqueLiveMemberId(ev.id, member.id)]));
  const latestMember = members.reduce((latest, member) => (member.created_at > latest ? member.created_at : latest), "");
  const latestIntro = intros.reduce((latest, intro) => (intro.created_at > latest ? intro.created_at : latest), "");
  const publicIdFingerprint = [...publicIds.values()].sort().join("|");
  const etag = `"${createHash("sha256").update(`${members.length}|${latestMember}|${latestIntro}|${publicIdFingerprint}`).digest("base64url")}"`;
  const cacheHeaders = { ETag: etag, "Cache-Control": "public, max-age=0, must-revalidate" };
  const ifNoneMatch = req.headers.get("if-none-match");
  const matchesEtag = ifNoneMatch
    ?.split(",")
    .some((candidate) => ["*", etag, `W/${etag}`].includes(candidate.trim()));
  if (matchesEtag) return new Response(null, { status: 304, headers: cacheHeaders });

  return Response.json(
    {
      event: { id: ev.id, name: ev.name, slug: ev.slug },
      count: members.length,
      members: members.map((member) => ({ id: publicIds.get(member.id)!, display_name: firstName(member.name) })),
      intros: intros.flatMap((intro) => {
        const a_id = publicIds.get(intro.a_id);
        const b_id = publicIds.get(intro.b_id);
        return a_id && b_id
          ? [{ a_id, b_id, created_at: intro.created_at, headline: headlineQuote(intro.reasons) }]
          : [];
      }),
    },
    { headers: cacheHeaders },
  );
}
