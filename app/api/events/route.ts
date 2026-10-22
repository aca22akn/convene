import { randomBytes } from "node:crypto";
import { z } from "zod";
import { admin } from "@/lib/db";
import { bad, json, slugify } from "@/lib/api";


const Body = z.object({
  name: z.string().trim().min(2).max(80),
  community_slug: z.string().trim().max(40).optional(),
  community_name: z.string().trim().max(80).optional(),
  community_token: z.string().optional(), // required to add an event to an existing community
});

/** Create an event (and its community if new). Admin tokens are returned once, here. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("invalid input");
  const { name, community_name, community_token } = parsed.data;
  const db = admin();
  const cslug = slugify(parsed.data.community_slug || community_name || name);
  let { data: community } = await db.from("communities").select("id,slug,admin_token").eq("slug", cslug).maybeSingle();
  let communityToken: string | null = null;
  if (community) {
    if (community.admin_token !== community_token) return bad("community exists: pass its admin token as community_token", 403);
  } else {
    const ins = await db
      .from("communities")
      .insert({ slug: cslug, name: community_name || name })
      .select("id,slug,admin_token")
      .single();
    if (ins.error) return bad(ins.error.message, 500);
    community = ins.data;
    communityToken = community.admin_token;
  }
  const slug = `${slugify(name)}-${randomBytes(2).toString("hex")}`;
  const { data: ev, error } = await db
    .from("events")
    .insert({ slug, name, community_id: community!.id })
    .select("slug,admin_token")
    .single();
  if (error) return bad(error.message, 500);
  return json({ slug: ev.slug, admin_token: ev.admin_token, community_slug: community!.slug, community_token: communityToken });
}
