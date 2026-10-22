import { describe, expect, it } from "vitest";
import { assignBlossom, assignGreedy, candidates, maxWeightMatching, tagScore, templateReasons } from "@/lib/match";
import { planIntros } from "@/lib/recompute";
import type { Edge, Member, Tag } from "@/lib/types";

let n = 0;
function m(id: string, offers: Tag[], seeks: Tag[], topics: Tag[] = [], line = `line of ${id}`): Member {
  return {
    id, event_id: "ev", name: `${id} Person`, line, offers, seeks, topics, speak_topics: [],
    contact_consent: false, is_sample: false, created_at: new Date(2026, 9, 22, 19, 0, n++).toISOString(),
  };
}
const e = (a: string, b: string, weight: number): Edge => ({ a, b, tagScore: weight, weight, reasons: [] });

function degrees(pairs: { a?: string; b?: string; a_id?: string; b_id?: string }[]) {
  const d = new Map<string, number>();
  for (const p of pairs) for (const id of [p.a ?? p.a_id!, p.b ?? p.b_id!]) d.set(id, (d.get(id) ?? 0) + 1);
  return d;
}

const room = () => [
  m("a", ["databases"], ["backend"], ["climate"]),
  m("b", ["backend"], ["databases"], ["climate"]),
  m("c", ["clinical-safety"], ["healthtech"]),
  m("d", ["healthtech"], ["clinical-safety"]),
  m("e", ["design", "accessibility"], ["frontend"], ["fintech"]),
  m("f", ["frontend"], ["design"], ["fintech"]),
  m("g", ["vc", "angel-investing"], ["climate"], ["climate"]),
];

describe("tagScore", () => {
  it("follows the formula", () => {
    const x = m("x", ["databases", "backend"], ["design"], ["climate", "data"]);
    const y = m("y", ["design"], ["databases", "backend"], ["climate"]);
    expect(tagScore(x, y)).toBe(2 * 2 + 2 * 1 + 0.5 * 1);
    expect(tagScore(x, y)).toBe(tagScore(y, x));
  });
});

describe("candidates", () => {
  it("handles 0 and 1 members", () => {
    expect(candidates([])).toEqual([]);
    expect(candidates([m("solo", ["ml"], ["data"])])).toEqual([]);
  });
  it("is canonical, deduped, normalised, no self", () => {
    const es = candidates(room());
    const keys = es.map((x) => `${x.a}|${x.b}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const x of es) {
      expect(x.a < x.b).toBe(true);
      expect(x.weight).toBeGreaterThan(0);
      expect(x.weight).toBeLessThanOrEqual(1);
    }
    expect(Math.max(...es.map((x) => x.weight))).toBe(1);
  });
});

describe("assignment", () => {
  it("returns nothing for empty input", () => {
    expect(assignGreedy([])).toEqual([]);
    expect(assignBlossom([])).toEqual([]);
  });
  it("respects capacity 2, no self, no duplicates (odd room)", () => {
    const es = candidates(room());
    for (const out of [assignGreedy(es), assignBlossom(es)]) {
      for (const [, d] of degrees(out)) expect(d).toBeLessThanOrEqual(2);
      const keys = out.map((x) => `${x.a}|${x.b}`);
      expect(new Set(keys).size).toBe(keys.length);
      for (const x of out) expect(x.a).not.toBe(x.b);
    }
  });
  it("blossom beats greedy on a path a-b 3, b-c 4, c-d 3 (single round)", () => {
    const es = [e("a", "b", 0.75), e("b", "c", 1), e("c", "d", 0.75)];
    const w = (x: Edge[]) => x.reduce((s, y) => s + y.weight, 0);
    expect(w(assignGreedy(es, 1))).toBe(1);
    expect(w(maxWeightMatching(es))).toBe(1.5);
    expect(assignBlossom(es, undefined, 1).map((x) => x.a + x.b).sort()).toEqual(["ab", "cd"]);
  });
  it("blossom matches brute force on random small graphs", () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let t = 0; t < 40; t++) {
      const ids = ["a", "b", "c", "d", "e", "f"].slice(0, 3 + (t % 4));
      const es: Edge[] = [];
      for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++) if (rnd() < 0.6) es.push(e(ids[i], ids[j], Math.round(rnd() * 1000) / 1000 + 0.001));
      let best = 0;
      const rec = (k: number, used: Set<string>, acc: number) => {
        best = Math.max(best, acc);
        for (let x = k; x < es.length; x++) {
          if (used.has(es[x].a) || used.has(es[x].b)) continue;
          rec(x + 1, new Set([...used, es[x].a, es[x].b]), acc + es[x].weight);
        }
      };
      rec(0, new Set(), 0);
      expect(maxWeightMatching(es).reduce((s, y) => s + y.weight, 0)).toBeCloseTo(best, 2);
    }
  });
  it("two rounds give up to 2 intros each", () => {
    const es = [e("a", "b", 1), e("a", "c", 0.9), e("b", "c", 0.8), e("c", "d", 0.5)];
    const out = assignBlossom(es);
    expect(out.length).toBeGreaterThan(2);
    for (const [, d] of degrees(out)) expect(d).toBeLessThanOrEqual(2);
  });
  it("is deterministic regardless of input order", () => {
    const es = candidates(room());
    const rev = [...es].reverse();
    expect(assignBlossom(rev)).toEqual(assignBlossom(es));
    expect(assignGreedy(rev)).toEqual(assignGreedy(es));
    expect(candidates([...room()].reverse())).toEqual(candidates(room()));
  });
});

describe("planIntros", () => {
  it("handles 0/1/2 members", () => {
    expect(planIntros([], [])).toEqual([]);
    expect(planIntros([m("a", ["ml"], ["data"])], [])).toEqual([]);
    const two = planIntros([m("a", ["ml"], ["data"]), m("b", ["data"], ["ml"])], []);
    expect(two).toHaveLength(1);
    expect(two[0].reasons.length).toBeGreaterThan(0);
  });
  it("is idempotent and keeps existing intros fixed", () => {
    const ms = room();
    const first = planIntros(ms, []);
    expect(first.length).toBeGreaterThan(0);
    for (const [, d] of degrees(first)) expect(d).toBeLessThanOrEqual(2);
    expect(planIntros(ms, first)).toEqual([]);
  });
  it("adds a newcomer without exceeding capacity", () => {
    const ms = room();
    const first = planIntros(ms, []);
    const late = m("h", ["backend"], ["vc"], ["climate"]);
    const second = planIntros([...ms, late], first);
    for (const [, d] of degrees([...first, ...second])) expect(d).toBeLessThanOrEqual(2);
    const keys = [...first, ...second].map((x) => `${x.a_id}|${x.b_id}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("seeded sample members stay available to live joiners; real members keep the strict cap", () => {
    const s = (id: string, offers: Tag[], seeks: Tag[]) => ({ ...m(id, offers, seeks), is_sample: true });
    const seeded = [s("a", ["clinical-safety"], ["databases"]), s("b", ["databases"], ["clinical-safety"]), s("c", ["databases"], ["healthtech"]), s("d", ["healthtech"], ["databases"])];
    // Fill every sample to 2 intros among themselves.
    const full = [{ a_id: "a", b_id: "b" }, { a_id: "c", b_id: "d" }, { a_id: "a", b_id: "c" }, { a_id: "b", b_id: "d" }];
    expect(planIntros(seeded, full)).toEqual([]);
    const live = m("z", ["healthtech"], ["clinical-safety", "databases"]);
    const out = planIntros([...seeded, live], full, "z");
    expect(out.length).toBe(2);
    expect(out.every((x) => x.a_id === "z" || x.b_id === "z")).toBe(true);
    // A second real joiner can still meet samples, but z (real) is now capped at 2.
    const live2 = m("y", ["clinical-safety"], ["healthtech"]);
    const out2 = planIntros([...seeded, live, live2], [...full, ...out], "y");
    expect(out2.some((x) => x.a_id === "z" || x.b_id === "z")).toBe(false);
    expect(out2.length).toBeGreaterThan(0);
  });
  it("uses grounded rerank reasons and drops score-0 pairs", () => {
    const a = m("a", [], [], [], "Building a Postgres sharding tool, need real users");
    const b = m("b", [], [], [], "Building carbon accounting, need Postgres at scale");
    const c = m("c", [], [], [], "Running a book club");
    const rr = new Map([
      ["b", { score: 9, reasons: [{ text: "Postgres both ways", quote: "Postgres at scale", grounded: true }] }],
      ["c", { score: 0, reasons: [] }],
    ]);
    const out = planIntros([a, b, c], [], "a", rr);
    expect(out).toHaveLength(1);
    expect(out[0].a_id + out[0].b_id).toBe("ab");
    expect(out[0].reasons[0].quote).toBe("Postgres at scale");
    expect(out[0].score).toBeCloseTo(0.54, 3);
  });
});

describe("templateReasons", () => {
  it("explains shared tags without quotes", () => {
    const r = templateReasons(m("a", ["databases"], ["backend"]), m("b", ["backend"], ["databases"]));
    expect(r).toHaveLength(2);
    expect(r.every((x) => !x.grounded && x.quote === null)).toBe(true);
  });
});
