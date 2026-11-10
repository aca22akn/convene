// Recompute intros for an event after a join. Existing intros are fixed; only new pairs are added.
import { admin } from "./db";
import { assignBlossom, candidates, pairKey, tagScore, templateReasons } from "./match";
import { notifyEvent } from "./realtime";
import { rerank, rerankWeight, type RerankResult } from "./rerank";
import type { Edge, Intro, Member } from "./types";

export const MAX_INTROS = 2;
export const RERANK_K = 8;
const RECOMPUTE_MEMBER_COLS = "id,event_id,name,line,offers,seeks,topics,is_sample,created_at,ai_opt_out";

type ExistingIntro = Pick<Intro, "a_id" | "b_id">;

/**
 * Remaining intro capacity per member. Real members: strictly MAX_INTROS in total.
 * Sample (seed) members: intros among themselves don't use up capacity toward real joiners,
 * so a seeded room never "fills up" before the first live person arrives.
 * `strict` is the plain total-based capacity, used to gate sample–sample pairs.
 */
export function capacities(members: Pick<Member, "id" | "is_sample">[], existing: ExistingIntro[]) {
  const sample = new Map(members.map((m) => [m.id, !!m.is_sample]));
  const strict = new Map(members.map((m) => [m.id, MAX_INTROS]));
  const cap = new Map(members.map((m) => [m.id, MAX_INTROS]));
  for (const i of existing) {
    const bothSample = sample.get(i.a_id) && sample.get(i.b_id);
    for (const id of [i.a_id, i.b_id]) {
      if (!strict.has(id)) continue;
      strict.set(id, strict.get(id)! - 1);
      if (!bothSample || !sample.get(id)) cap.set(id, cap.get(id)! - 1);
    }
  }
  return { cap, strict, sample };
}

type Caps = ReturnType<typeof capacities>;

/** Can a new intro between x and y still be made? */
export function canAddIntro(c: Caps, x: string, y: string): boolean {
  if ((c.cap.get(x) ?? 0) <= 0 || (c.cap.get(y) ?? 0) <= 0) return false;
  if (c.sample.get(x) && c.sample.get(y)) return (c.strict.get(x) ?? 0) > 0 && (c.strict.get(y) ?? 0) > 0;
  return true;
}

/** Apply a committed pair to a mutable capacity snapshot. */
export function addIntroCapacity(c: Caps, x: string, y: string): void {
  const bothSample = c.sample.get(x) && c.sample.get(y);
  for (const id of [x, y]) {
    if (!c.cap.has(id)) continue;
    c.strict.set(id, (c.strict.get(id) ?? 0) - 1);
    if (!bothSample || !c.sample.get(id)) c.cap.set(id, (c.cap.get(id) ?? 0) - 1);
  }
}

/** Who the new member's single Grok call should score: top-k by tag score, topped up with zero-overlap people. */
export function rerankCandidates(members: Member[], existing: ExistingIntro[], newMemberId: string, k = RERANK_K): Member[] {
  const me = members.find((m) => m.id === newMemberId);
  const caps = capacities(members, existing);
  if (!me || me.ai_opt_out || (caps.cap.get(me.id) ?? 0) <= 0) return [];
  const done = new Set(existing.map((i) => pairKey(i.a_id, i.b_id)));
  return members
    .filter((o) => o.id !== me.id && !o.ai_opt_out && canAddIntro(caps, me.id, o.id) && !done.has(pairKey(me.id, o.id)))
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
  const caps = capacities(members, existing);
  const cap = caps.cap;
  const eligible = members.filter((m) => (cap.get(m.id) ?? 0) > 0);
  const done = new Set(existing.map((i) => pairKey(i.a_id, i.b_id)));
  const edges = new Map<string, Edge>();
  // A join only adds edges for that member; existing members' committed pairs stay untouched.
  for (const e of candidates(eligible, 8, newMemberId)) if (!done.has(pairKey(e.a, e.b)) && canAddIntro(caps, e.a, e.b)) edges.set(pairKey(e.a, e.b), e);

  if (newMemberId && rerankMap) {
    const me = members.find((m) => m.id === newMemberId);
    const maxTag = Math.max(0, ...[...edges.values()].map((e) => e.tagScore));
    if (me) {
      for (const [cid, r] of rerankMap) {
        const other = members.find((m) => m.id === cid);
        if (!other || other.id === me.id || done.has(pairKey(me.id, cid))) continue;
        if (!canAddIntro(caps, me.id, cid)) continue;
        const ts = tagScore(me, other);
        const norm = maxTag > 0 ? Math.min(1, ts / maxTag) : 0;
        const [a, b] = me.id < cid ? [me.id, cid] : [cid, me.id];
        edges.set(pairKey(a, b), { a, b, tagScore: ts, rerank: r.score, weight: rerankWeight(norm, r.score), reasons: r.reasons });
      }
    }
  }

  const byId = new Map(members.map((m) => [m.id, m]));
  // Rounds continue until no eligible edge is left, so a recompute right after is a no-op (idempotent).
  const assigned = assignBlossom([...edges.values()], cap, Number.POSITIVE_INFINITY);
  const accepted: Edge[] = [];
  for (const edge of assigned) {
    if (!canAddIntro(caps, edge.a, edge.b)) continue;
    accepted.push(edge);
    addIntroCapacity(caps, edge.a, edge.b);
  }
  return accepted.map((e) => {
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

/** Load and plan outside the transaction; the database serializes and rechecks the commit. */
export async function recompute(eventId: string, newMemberId?: string, options: { signal?: AbortSignal; aiEnabled?: boolean } = {}): Promise<Intro[]> {
  const db = admin();
  const [{ data: members, error: me }, { data: existing, error: ie }] = await Promise.all([
    db.from("members").select(RECOMPUTE_MEMBER_COLS).eq("event_id", eventId).order("created_at"),
    db.from("intros").select("a_id,b_id").eq("event_id", eventId),
  ]);
  if (me) throw me;
  if (ie) throw ie;
  const ms = (members ?? []) as Member[];
  const ex = (existing ?? []) as ExistingIntro[];

  let rr: RerankResult | null = null;
  let aiEnabled = options.aiEnabled;
  if (aiEnabled === undefined) {
    const { data: event } = await db.from("events").select("ai_enabled").eq("id", eventId).maybeSingle();
    aiEnabled = event?.ai_enabled === true;
  }
  if (newMemberId && aiEnabled) {
    const me2 = ms.find((m) => m.id === newMemberId);
    const cands = rerankCandidates(ms, ex, newMemberId);
    if (me2 && cands.length) rr = await rerank(me2, cands, { eventId, signal: options.signal, enabled: aiEnabled }).catch(() => null);
  }

  let currentMembers = ms;
  let currentExisting = ex;
  let planned = planIntros(currentMembers, currentExisting, newMemberId, rr);
  const inserted: Intro[] = [];
  for (let retry = 0; planned.length > 0 && retry <= 2; retry++) {
    const { data, error } = await db.rpc("convene_commit_intros", { p_event: eventId, p_pairs: planned });
    if (error) throw error;
    const committed = (data ?? []) as Intro[];
    inserted.push(...committed);
    if (committed.length >= planned.length || retry === 2) break;
    const [{ data: freshMembers, error: freshMembersError }, { data: freshIntros, error: freshIntrosError }] = await Promise.all([
      db.from("members").select("*").eq("event_id", eventId).order("created_at"),
      db.from("intros").select("a_id,b_id").eq("event_id", eventId),
    ]);
    if (freshMembersError) throw freshMembersError;
    if (freshIntrosError) throw freshIntrosError;
    currentMembers = (freshMembers ?? []) as Member[];
    currentExisting = (freshIntros ?? []) as ExistingIntro[];
    if (newMemberId && (capacities(currentMembers, currentExisting).cap.get(newMemberId) ?? 0) <= 0) break;
    planned = planIntros(currentMembers, currentExisting, newMemberId, rr);
  }
  if (inserted.length > 0) {
    await notifyEvent(eventId).catch((e) => console.error("[recompute] realtime notify failed", e));
  }
  return inserted;
}
