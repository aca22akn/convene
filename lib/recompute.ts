// Recompute intros for an event after a join. Existing intros are fixed; only new pairs are added.
import { admin } from "./db";
import { assignBlossom, candidates, pairKey, tagScore, templateReasons } from "./match";
import { rerank, rerankWeight, type RerankResult } from "./rerank";
import type { Edge, Intro, Member } from "./types";

export const MAX_INTROS = 2;
export const RERANK_K = 8;

type ExistingIntro = Pick<Intro, "a_id" | "b_id">;

function capacities(members: Member[], existing: ExistingIntro[]) {
  const cap = new Map(members.map((m) => [m.id, MAX_INTROS]));
  for (const i of existing) {
    if (cap.has(i.a_id)) cap.set(i.a_id, cap.get(i.a_id)! - 1);
    if (cap.has(i.b_id)) cap.set(i.b_id, cap.get(i.b_id)! - 1);
  }
  return cap;
}

/** Who the new member's single Grok call should score: top-k by tag score, topped up with zero-overlap people. */
export function rerankCandidates(members: Member[], existing: ExistingIntro[], newMemberId: string, k = RERANK_K): Member[] {
  const me = members.find((m) => m.id === newMemberId);
  const cap = capacities(members, existing);
  if (!me || (cap.get(me.id) ?? 0) <= 0) return [];
  const done = new Set(existing.map((i) => pairKey(i.a_id, i.b_id)));
  return members
    .filter((o) => o.id !== me.id && (cap.get(o.id) ?? 0) > 0 && !done.has(pairKey(me.id, o.id)))
    .map((o) => ({ o, s: tagScore(me, o) }))
    // highest tag score first, then most recent joiners (they are still waiting for intros)
    .sort((p, q) => q.s - p.s || (q.o.created_at > p.o.created_at ? 1 : q.o.created_at < p.o.created_at ? -1 : p.o.id < q.o.id ? -1 : 1))
    .slice(0, k)
    .map((x) => x.o);
}

/** Pure planning step: everything except I/O. Returns the new intros to insert. */
export function planIntros(
  members: Member[],
  existing: ExistingIntro[],
  newMemberId?: string,
  rerankMap?: RerankResult | null,
): Omit<Intro, "id" | "created_at">[] {
  if (members.length < 2) return [];
  const eventId = members[0].event_id;
  const cap = capacities(members, existing);
  const eligible = members.filter((m) => (cap.get(m.id) ?? 0) > 0);
  const done = new Set(existing.map((i) => pairKey(i.a_id, i.b_id)));
  const edges = new Map<string, Edge>();
  for (const e of candidates(eligible)) if (!done.has(pairKey(e.a, e.b))) edges.set(pairKey(e.a, e.b), e);

  if (newMemberId && rerankMap) {
    const me = members.find((m) => m.id === newMemberId);
    const maxTag = Math.max(0, ...[...edges.values()].map((e) => e.tagScore));
    if (me) {
      for (const [cid, r] of rerankMap) {
        const other = members.find((m) => m.id === cid);
        if (!other || other.id === me.id || done.has(pairKey(me.id, cid))) continue;
        if ((cap.get(cid) ?? 0) <= 0 || (cap.get(me.id) ?? 0) <= 0) continue;
        const ts = tagScore(me, other);
        const norm = maxTag > 0 ? Math.min(1, ts / maxTag) : 0;
        const [a, b] = me.id < cid ? [me.id, cid] : [cid, me.id];
        edges.set(pairKey(a, b), { a, b, tagScore: ts, rerank: r.score, weight: rerankWeight(norm, r.score), reasons: r.reasons });
      }
    }
  }

  const byId = new Map(members.map((m) => [m.id, m]));
  // Rounds continue until no eligible edge is left, so a recompute right after is a no-op (idempotent).
  return assignBlossom([...edges.values()], cap, Number.POSITIVE_INFINITY).map((e) => {
    const grounded = e.reasons.filter((r) => r.grounded);
    return {
      event_id: eventId,
      a_id: e.a,
      b_id: e.b,
      score: Math.round(e.weight * 1000) / 1000,
      reasons: grounded.length ? grounded : templateReasons(byId.get(e.a)!, byId.get(e.b)!),
    };
  });
}

/** Load, plan, insert. Never throws on Grok failure (falls back to tags only). Idempotent. */
export async function recompute(eventId: string, newMemberId?: string): Promise<Intro[]> {
  const db = admin();
  const [{ data: members, error: me }, { data: existing, error: ie }] = await Promise.all([
    db.from("members").select("*").eq("event_id", eventId).order("created_at"),
    db.from("intros").select("a_id,b_id").eq("event_id", eventId),
  ]);
  if (me) throw me;
  if (ie) throw ie;
  const ms = (members ?? []) as Member[];
  const ex = (existing ?? []) as ExistingIntro[];

  let rr: RerankResult | null = null;
  if (newMemberId) {
    const me2 = ms.find((m) => m.id === newMemberId);
    const cands = rerankCandidates(ms, ex, newMemberId);
    if (me2 && cands.length) rr = await rerank(me2, cands).catch(() => null);
  }

  const planned = planIntros(ms, ex, newMemberId, rr);
  if (planned.length === 0) return [];
  const { data, error } = await db
    .from("intros")
    .upsert(planned, { onConflict: "event_id,a_id,b_id", ignoreDuplicates: true })
    .select();
  if (error) throw error;
  return (data ?? []) as Intro[];
}
