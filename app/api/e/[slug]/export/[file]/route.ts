import { admin } from "@/lib/db";
import { bad, eventMembers, getEvent, tokenOk } from "@/lib/api";
import { buildIntrosCsv, buildMembersCsv, buildVcf } from "@/lib/export";
import type { Intro } from "@/lib/types";


export async function GET(req: Request, ctx: { params: Promise<{ slug: string; file: string }> }) {
  const { slug, file } = await ctx.params;
  const token = new URL(req.url).searchParams.get("token");
  const ev = await getEvent(slug);
  if (!ev) return bad("event not found", 404);
  if (!(await tokenOk(ev, token))) return bad("unauthorized", 401);
  const members = await eventMembers(ev.id, true);
  let body: string;
  let type: string;
  if (file === "contacts.vcf") {
    body = buildVcf(members, ev.name);
    type = "text/vcard; charset=utf-8";
  } else if (file === "members.csv") {
    body = buildMembersCsv(members);
    type = "text/csv; charset=utf-8";
  } else if (file === "intros.csv") {
    const { data } = await admin().from("intros").select("*").eq("event_id", ev.id).order("created_at");
    body = buildIntrosCsv((data ?? []) as Intro[], members);
    type = "text/csv; charset=utf-8";
  } else return bad("unknown file", 404);
  return new Response(body, {
    headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="${ev.slug}-${file}"`, "Cache-Control": "no-store" },
  });
}
