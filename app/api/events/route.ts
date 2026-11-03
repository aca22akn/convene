import { randomBytes } from "node:crypto";
import { z } from "zod";
import { admin } from "@/lib/db";
import { bad, json, slugify } from "@/lib/api";
import { hashToken, tokenHashMatches } from "@/lib/auth";

const MAX_SLUG_ATTEMPTS = 5;

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
  let { data: community } = await db.from("communities").select("id,slug,admin_token_hash").eq("slug", cslug).maybeSingle();
  let communityToken: string | null = null;
  if (community) {
    if (!tokenHashMatches(community_token ?? "", community.admin_token_hash)) return bad("community exists: pass its admin token as community_token", 403);
  } else {
    communityToken = newAdminToken();
    const ins = await db
      .from("communities")
      .insert({ slug: cslug, name: community_name || name, admin_token_hash: hashToken(communityToken) })
      .select("id,slug")
      .single();
    if (ins.error) return bad(ins.error.message, 500);
    community = { ...ins.data, admin_token_hash: hashToken(communityToken) };
  }
  const eventToken = newAdminToken();
  let ev: { slug: string } | null = null;
  let eventError: { code?: string; message: string } | null = null;
  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
    const slug = generateEventSlug(name);
    const result = await db
      .from("events")
      .insert({ slug, name, community_id: community!.id, admin_token_hash: hashToken(eventToken) })
      .select("slug")
      .single();
    if (!result.error) {
      ev = result.data;
      eventError = null;
      break;
    }
    eventError = result.error;
    if (result.error.code !== "23505") break;
  }
  if (eventError || !ev) return bad(eventError?.message ?? "event creation failed", 500);
  return json({ slug: ev.slug, admin_token: eventToken, community_slug: community!.slug, community_token: communityToken });
}

export function generateEventSlug(name: string): string {
  return `${slugify(name)}-${randomBytes(6).toString("hex")}`;
}

export function newAdminToken(): string {
  return randomBytes(32).toString("base64url");
}
