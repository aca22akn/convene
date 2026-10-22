// Server-side helpers shared by API routes (Lane A).
import { admin } from "./db";
import type { Member } from "./types";

export type EventRow = { id: string; slug: string; name: string; community_id: string | null; admin_token: string; created_at: string };

/** Columns safe to send to any browser (no contact, no tokens). */
export const PUBLIC_MEMBER_COLS =
  "id,event_id,person_id,name,line,x_handle,speak_on,contact_consent,offers,seeks,topics,speak_topics,is_sample,created_at";

export async function getEvent(slug: string): Promise<EventRow | null> {
  const { data } = await admin().from("events").select("*").eq("slug", slug).maybeSingle();
  return (data as EventRow) ?? null;
}

/** Token is valid for an event if it equals the event's token or its community's token. */
export async function tokenOk(ev: EventRow, token: string | null | undefined): Promise<boolean> {
  if (!token) return false;
  if (token === ev.admin_token) return true;
  if (!ev.community_id) return false;
  const { data } = await admin().from("communities").select("admin_token").eq("id", ev.community_id).maybeSingle();
  return !!data && data.admin_token === token;
}

/** Resolve an admin token (community or event) to the community it governs. */
export async function communityForToken(token: string | null | undefined): Promise<{ id: string; slug: string; name: string } | null> {
  if (!token) return null;
  const db = admin();
  const { data: c } = await db.from("communities").select("id,slug,name").eq("admin_token", token).maybeSingle();
  if (c) return c;
  const { data: e } = await db.from("events").select("community_id").eq("admin_token", token).maybeSingle();
  if (!e?.community_id) return null;
  const { data: c2 } = await db.from("communities").select("id,slug,name").eq("id", e.community_id).maybeSingle();
  return c2 ?? null;
}

export async function eventMembers(eventId: string, withContact = false): Promise<Member[]> {
  const { data, error } = await admin()
    .from("members")
    .select(withContact ? "*" : PUBLIC_MEMBER_COLS)
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as Member[];
}

export const json = (body: unknown, status = 200) => Response.json(body, { status });
export const bad = (msg: string, status = 400) => Response.json({ error: msg }, { status });

export function bearer(req: Request): string | null {
  const h = req.headers.get("authorization");
  return h?.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : null;
}

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "event";
}

/** Count tags across members: needs (seeks) and offers. */
export function tagCounts(members: Pick<Member, "offers" | "seeks">[]) {
  const needs: Record<string, number> = {};
  const offers: Record<string, number> = {};
  for (const m of members) {
    for (const t of m.seeks ?? []) needs[t] = (needs[t] ?? 0) + 1;
    for (const t of m.offers ?? []) offers[t] = (offers[t] ?? 0) + 1;
  }
  const unmet = Object.keys(needs).filter((t) => !offers[t]).sort((a, b) => needs[b] - needs[a]);
  return { needs, offers, unmet };
}

/** Speakers ranked by number of speak topics, then by demand (how many people seek those topics). */
export function rankSpeakers<T extends Pick<Member, "speak_on" | "speak_topics">>(members: T[], needs: Record<string, number>): (T & { demand: number })[] {
  return members
    .filter((m) => (m.speak_on && m.speak_on.trim()) || (m.speak_topics?.length ?? 0) > 0)
    .map((m) => ({ ...m, demand: (m.speak_topics ?? []).reduce((s, t) => s + (needs[t] ?? 0), 0) }))
    .sort((a, b) => (b.speak_topics?.length ?? 0) - (a.speak_topics?.length ?? 0) || b.demand - a.demand);
}
