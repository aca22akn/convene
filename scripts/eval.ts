// npm run eval — precision@2 / recall vs data/labelled_pairs.json for {greedy, blossom} x {tags-only, reranked},
// % grounded reasons, and p50/p95 join-to-intro latency. Writes the table into README.md between EVAL markers.
import { readFileSync, writeFileSync } from "node:fs";
import { extract, pool } from "../lib/extract";
import { keywordExtract } from "../lib/keywords";
import { assignBlossom, assignGreedy, candidates, pairKey, tagScore, templateReasons } from "../lib/match";
import { planIntros, rerankCandidates } from "../lib/recompute";
import { RERANK_MODEL, rerank, rerankWeight, type RerankResult } from "../lib/rerank";
import type { Edge, Member } from "../lib/types";

type Sample = { sample_id: number; name: string; line: string; speak_on?: string | null };
type Pair = { a: number; b: number; label: string };

const samples: Sample[] = JSON.parse(readFileSync("data/sample_members.json", "utf8")).members;
const pairs: Pair[] = JSON.parse(readFileSync("data/labelled_pairs.json", "utf8")).pairs;
const id = (sid: number) => `m${String(sid).padStart(3, "0")}`;
const good = new Set(pairs.filter((p) => p.label === "should_meet").map((p) => pairKey(id(p.a), id(p.b))));
const bad = new Set(pairs.filter((p) => p.label !== "should_meet").map((p) => pairKey(id(p.a), id(p.b))));
const hasKey = !!process.env.XAI_API_KEY;

const base = (s: Sample, i: number): Omit<Member, "offers" | "seeks" | "topics" | "speak_topics"> => ({
  id: id(s.sample_id), event_id: "eval", name: s.name, line: s.line, speak_on: s.speak_on ?? null,
  contact_consent: false, is_sample: true, created_at: new Date(Date.UTC(2026, 9, 22, 18, 0, i)).toISOString(),
});

function score(intros: { a: string; b: string }[]) {
  const keys = intros.map((e) => pairKey(e.a, e.b));
  const hits = keys.filter((k) => good.has(k)).length;
  const misses = keys.filter((k) => bad.has(k)).length;
  return {
    precision: hits + misses ? hits / (hits + misses) : NaN,
    recall: good.size ? hits / good.size : NaN,
    hits, misses, n: intros.length,
  };
}

const pct = (x: number) => (Number.isNaN(x) ? "n/a" : `${Math.round(x * 100)}%`);
const quantile = (xs: number[], q: number) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};

async function main() {
  console.log(`Eval on ${samples.length} sample members, ${good.size} should_meet / ${bad.size} should_not_meet pairs. Grok: ${hasKey ? "on" : "off"}`);

  // Extraction (Grok if a key is set, else keyword fallback); keyword-only also kept as the no-key baseline.
  const ext = await pool(samples, 6, (s) => extract(s.line, s.speak_on));
  const members: Member[] = samples.map((s, i) => ({ ...base(s, i), ...ext[i] }));
  const kwMembers: Member[] = samples.map((s, i) => ({ ...base(s, i), ...keywordExtract(s.line, s.speak_on) }));
  const extractMs = ext.map((e) => e.ms);
  const grokExtracted = ext.filter((e) => e.source === "grok").length;

  const rows: string[][] = [];
  const add = (assign: string, scoring: string, r: ReturnType<typeof score> | null, grounded = "—") =>
    rows.push([assign, scoring, r ? pct(r.precision) : "n/a", r ? `${pct(r.recall)} (${r.hits}/${good.size})` : "n/a", r ? String(r.misses) : "n/a", r ? String(r.n) : "n/a", grounded]);

  const kwEdges = candidates(kwMembers);
  add("greedy", "tags (keyword extraction, no API key)", score(assignGreedy(kwEdges)));
  add("blossom", "tags (keyword extraction, no API key)", score(assignBlossom(kwEdges)));

  const tagEdges = candidates(members);
  const extLabel = grokExtracted ? "tags (Grok extraction)" : "tags (keyword extraction)";
  if (hasKey) {
    add("greedy", extLabel, score(assignGreedy(tagEdges)));
    add("blossom", extLabel, score(assignBlossom(tagEdges)));
  }

  // Reranked: simulate joins in order. Each newcomer makes ONE rerank call against its top-8 candidates
  // among people already in the room. Latency per join = extraction + rerank + assignment.
  const latencies: number[] = [];
  let groundedReasons = 0;
  let totalReasons = 0;
  if (hasKey) {
    const reranks: (RerankResult | null)[] = await pool(members, 4, async (m, i) => {
      const room = members.slice(0, i + 1);
      const cands = rerankCandidates(room, [], m.id);
      const t0 = Date.now();
      const rr = cands.length ? await rerank(m, cands) : null;
      const rerankMs = Date.now() - t0;
      const t1 = Date.now();
      planIntros(room, [], m.id, rr);
      latencies[i] = ext[i].ms + rerankMs + (Date.now() - t1);
      return rr;
    });

    // Full graph: stage-1 edges, with every reranked pair overriding its weight per the formula.
    const maxTag = Math.max(0, ...tagEdges.map((e) => e.tagScore));
    const edges = new Map<string, Edge>(tagEdges.map((e) => [pairKey(e.a, e.b), { ...e }]));
    members.forEach((m, i) => {
      for (const [cid, r] of reranks[i] ?? []) {
        const other = members.find((x) => x.id === cid)!;
        const ts = tagScore(m, other);
        const [a, b] = m.id < cid ? [m.id, cid] : [cid, m.id];
        edges.set(pairKey(a, b), { a, b, tagScore: ts, rerank: r.score, weight: rerankWeight(maxTag ? ts / maxTag : 0, r.score), reasons: r.reasons });
      }
    });
    const all = [...edges.values()];
    const byId = new Map(members.map((m) => [m.id, m]));
    const reasonsOf = (e: Edge) => (e.reasons.some((r) => r.grounded) ? e.reasons : templateReasons(byId.get(e.a)!, byId.get(e.b)!));
    const g = assignGreedy(all);
    const bl = assignBlossom(all);
    for (const e of bl) {
      const rs = reasonsOf(e);
      totalReasons += rs.length;
      groundedReasons += rs.filter((r) => r.grounded).length;
    }
    const gr = (xs: Edge[]) => {
      const rs = xs.flatMap(reasonsOf);
      return pct(rs.filter((r) => r.grounded).length / Math.max(1, rs.length));
    };
    add("greedy", "reranked (tags + Grok)", score(g), gr(g));
    add("blossom", "reranked (tags + Grok)", score(bl), gr(bl));
  } else {
    add("greedy", "reranked (tags + Grok)", null, "n/a");
    add("blossom", "reranked (tags + Grok)", null, "n/a");
  }

  const header = ["Assignment", "Scoring", "Precision@2", "Recall", "should_not_meet produced", "Intros", "Grounded reasons"];
  const table = [
    `| ${header.join(" | ")} |`,
    `|${header.map(() => "---").join("|")}|`,
    ...rows.map((r) => `| ${r.join(" | ")} |`),
  ].join("\n");
  const p50 = quantile(latencies.filter((x) => x != null), 0.5);
  const p95 = quantile(latencies.filter((x) => x != null), 0.95);
  const extP50 = quantile(extractMs, 0.5);
  const notes = [
    `Data: ${samples.length} fictional sample members, ${good.size} \`should_meet\` and ${bad.size} \`should_not_meet\` human-reviewed pairs. Each person gets at most 2 intros.`,
    `Precision@2 = should_meet / (should_meet + should_not_meet) among produced intros that were labelled; recall = labelled should_meet pairs produced / all should_meet pairs.`,
    hasKey
      ? `Extraction: ${grokExtracted}/${samples.length} by Grok (p50 ${Math.round(extP50)} ms). Join-to-intro latency (extraction + one rerank call + assignment): p50 ${Math.round(p50)} ms, p95 ${Math.round(p95)} ms. Grounded reasons (blossom, reranked): ${pct(groundedReasons / Math.max(1, totalReasons))} — the rest fall back to tag templates.`
      : `No XAI_API_KEY: reranked rows and latency are n/a.`,
    `Extraction model: ${process.env.XAI_MODEL || "grok-4.7"}; rerank model: ${RERANK_MODEL}. Run on ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC with \`npm run eval\`.`,
  ];
  const block = `${table}\n\n${notes.map((n) => `- ${n}`).join("\n")}`;
  console.log("\n" + block + "\n");

  const readme = readFileSync("README.md", "utf8");
  const START = "<!-- EVAL:START -->";
  const END = "<!-- EVAL:END -->";
  const next = readme.includes(START) && readme.includes(END)
    ? readme.replace(new RegExp(`${START}[\\s\\S]*?${END}`), `${START}\n${block}\n${END}`)
    : `${readme.trimEnd()}\n\n## Evaluation\n\n${START}\n${block}\n${END}\n`;
  writeFileSync("README.md", next);
  console.log("README.md updated.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
