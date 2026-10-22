// Stage-1 tag matching and assignment (greedy + Edmonds' blossom). Pure functions, no I/O.
import type { Edge, Member, Reason, Tag } from "./types";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const blossom: (edges: [number, number, number][], maxCardinality?: boolean) => number[] = require("edmonds-blossom");

type Tagged = Pick<Member, "id" | "name" | "offers" | "seeks" | "topics">;

const inter = (a: readonly string[], b: readonly string[]) => a.filter((t, i) => b.includes(t) && a.indexOf(t) === i);

/** score(i,j) = 2*|offers_i ∩ seeks_j| + 2*|offers_j ∩ seeks_i| + 0.5*|topics_i ∩ topics_j| */
export function tagScore(i: Tagged, j: Tagged): number {
  return 2 * inter(i.offers, j.seeks).length + 2 * inter(j.offers, i.seeks).length + 0.5 * inter(i.topics, j.topics).length;
}

export const pairKey = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`);
const canon = (x: string, y: string): [string, string] => (x < y ? [x, y] : [y, x]);

/** Top-k partners per member by tag score (>0), unioned and deduped. weight = tagScore / max tagScore. */
export function candidates(members: Tagged[], k = 8): Edge[] {
  const byKey = new Map<string, Edge>();
  const sorted = [...members].sort((p, q) => (p.id < q.id ? -1 : p.id > q.id ? 1 : 0));
  for (const m of sorted) {
    const scored = sorted
      .filter((o) => o.id !== m.id)
      .map((o) => ({ o, s: tagScore(m, o) }))
      .filter((x) => x.s > 0)
      .sort((p, q) => q.s - p.s || (p.o.id < q.o.id ? -1 : 1))
      .slice(0, k);
    for (const { o, s } of scored) {
      const [a, b] = canon(m.id, o.id);
      const key = `${a}|${b}`;
      if (!byKey.has(key)) byKey.set(key, { a, b, tagScore: s, weight: 0, reasons: [] });
    }
  }
  const edges = [...byKey.values()];
  const max = Math.max(0, ...edges.map((e) => e.tagScore));
  for (const e of edges) e.weight = max > 0 ? e.tagScore / max : 0;
  return edges.sort(edgeOrder);
}

/** weight desc, then (a,b) asc — the deterministic order used everywhere. */
export function edgeOrder(p: Edge, q: Edge): number {
  return q.weight - p.weight || (p.a < q.a ? -1 : p.a > q.a ? 1 : p.b < q.b ? -1 : p.b > q.b ? 1 : 0);
}

function capOf(capacity: Map<string, number> | undefined, id: string, dflt: number) {
  return capacity?.get(id) ?? dflt;
}

/** Greedy best-first: take the heaviest edge whose endpoints both have capacity left. */
export function assignGreedy(edges: Edge[], cap = 2, capacity?: Map<string, number>): Edge[] {
  const left = new Map<string, number>();
  const out: Edge[] = [];
  const seen = new Set<string>();
  for (const e of [...edges].sort(edgeOrder)) {
    if (e.a === e.b || e.weight <= 0) continue;
    const key = pairKey(e.a, e.b);
    if (seen.has(key)) continue;
    const ca = left.get(e.a) ?? capOf(capacity, e.a, cap);
    const cb = left.get(e.b) ?? capOf(capacity, e.b, cap);
    if (ca <= 0 || cb <= 0) continue;
    left.set(e.a, ca - 1);
    left.set(e.b, cb - 1);
    seen.add(key);
    out.push(e);
  }
  return out;
}

/** One maximum-weight matching over `edges` (each node at most once). */
export function maxWeightMatching(edges: Edge[]): Edge[] {
  const usable = edges.filter((e) => e.a !== e.b && e.weight > 0);
  if (usable.length === 0) return [];
  const ids = [...new Set(usable.flatMap((e) => [e.a, e.b]))].sort();
  const idx = new Map(ids.map((id, i) => [id, i]));
  const byKey = new Map<string, Edge>();
  for (const e of [...usable].sort(edgeOrder)) {
    const key = pairKey(e.a, e.b);
    if (!byKey.has(key)) byKey.set(key, e);
  }
  const list = [...byKey.values()];
  // Integer weights keep the library's dual updates exact.
  const input = list.map((e) => [idx.get(e.a)!, idx.get(e.b)!, Math.max(1, Math.round(e.weight * 1000))] as [number, number, number]);
  let mate: number[];
  try {
    mate = blossom(input);
  } catch {
    return assignGreedy(list, 1);
  }
  const out: Edge[] = [];
  for (const e of list) {
    const i = idx.get(e.a)!;
    const j = idx.get(e.b)!;
    if (mate[i] === j && mate[j] === i) out.push(e);
  }
  return out.sort(edgeOrder);
}

/**
 * Maximum-weight matching in `rounds` rounds (default 2): round-1 pairs are removed and the
 * matching is run again, so each person gets up to `rounds` intros (bounded by capacity).
 */
export function assignBlossom(edges: Edge[], capacity?: Map<string, number>, rounds = 2, cap = 2): Edge[] {
  const left = new Map<string, number>();
  const capLeft = (id: string) => left.get(id) ?? capOf(capacity, id, cap);
  const chosen: Edge[] = [];
  const used = new Set<string>();
  for (let r = 0; r < rounds; r++) {
    const pool = edges.filter((e) => !used.has(pairKey(e.a, e.b)) && capLeft(e.a) > 0 && capLeft(e.b) > 0);
    const round = maxWeightMatching(pool);
    if (round.length === 0) break;
    for (const e of round) {
      used.add(pairKey(e.a, e.b));
      left.set(e.a, capLeft(e.a) - 1);
      left.set(e.b, capLeft(e.b) - 1);
      chosen.push(e);
    }
  }
  return chosen.sort(edgeOrder);
}

const first = (name: string) => name.trim().split(/\s+/)[0] || name;

/** Fallback reasons from shared tags; never quoted, so grounded=false. */
export function templateReasons(a: Pick<Member, "name" | "offers" | "seeks" | "topics">, b: Pick<Member, "name" | "offers" | "seeks" | "topics">): Reason[] {
  const out: Reason[] = [];
  for (const t of inter(a.seeks, b.offers) as Tag[]) out.push({ text: `${first(a.name)} is looking for ${t} — ${first(b.name)} offers it`, quote: null, grounded: false });
  for (const t of inter(b.seeks, a.offers) as Tag[]) out.push({ text: `${first(b.name)} is looking for ${t} — ${first(a.name)} offers it`, quote: null, grounded: false });
  const shared = inter(a.topics, b.topics);
  if (shared.length) out.push({ text: `You both work on ${shared.slice(0, 3).join(", ")}`, quote: null, grounded: false });
  if (out.length === 0) out.push({ text: `${first(a.name)} and ${first(b.name)} are both in the room — say hi`, quote: null, grounded: false });
  return out.slice(0, 2);
}
