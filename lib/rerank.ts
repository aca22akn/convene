// Stage-2 rerank: one Grok structured-output call per new member scores its candidates 0-10 with quoted reasons.
import { grok } from "./grok";
import { groundReasons } from "./ground";
import type { Member, Reason } from "./types";

/** Rerank runs on the live join path, so it defaults to a fast non-reasoning model (reasoning models took 20-40 s here). */
export const RERANK_MODEL = process.env.XAI_RERANK_MODEL || "grok-4.20-0309-non-reasoning";

export type RerankResult = Map<string, { score: number; reasons: Reason[] }>;
type Person = Pick<Member, "id" | "name" | "line"> & Partial<Pick<Member, "speak_on">>;

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["scores"],
  properties: {
    scores: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["candidate", "score", "reasons"],
        properties: {
          candidate: { type: "string" },
          score: { type: "integer" },
          reasons: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["text", "quote"],
              properties: { text: { type: "string" }, quote: { type: "string" } },
            },
          },
        },
      },
    },
  },
} as const;

/** Edge weight once reranked. */
export const rerankWeight = (normTag: number, rerank: number) => 0.4 * normTag + 0.6 * (rerank / 10);

/** Returns null when Grok is unavailable or fails; caller falls back to tag-only matching. */
export async function rerank(newMember: Person, cands: Person[]): Promise<RerankResult | null> {
  const client = grok();
  if (!client || cands.length === 0) return null;
  const labels = cands.map((c, i) => ({ key: `c${i + 1}`, c }));
  const prompt = [
    `A person just joined a London community event. Score how useful an in-person intro to each candidate would be, 0-10 (10 = one clearly has what the other needs).`,
    `For each candidate give exactly 2 reasons, each at most 12 words, addressed to both people. Each reason MUST include "quote": a phrase of 3-8 words copied CHARACTER-FOR-CHARACTER from one of the two lines below (same case and punctuation). Never paraphrase a quote. Only list the 3 best candidates that score 5 or more; omit everyone else. Be terse.`,
    ``,
    `NEW PERSON: ${newMember.name}`,
    `line: ${newMember.line}`,
    ``,
    `CANDIDATES:`,
    ...labels.map(({ key, c }) => `${key}: ${c.name}\nline: ${c.line}`),
  ].join("\n");
  try {
    const res = await client.chat.completions.create({
      model: RERANK_MODEL,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_schema", json_schema: { name: "rerank", strict: true, schema } },
    });
    const parsed = JSON.parse(res.choices[0]?.message?.content ?? "{}") as {
      scores?: { candidate: string; score: number; reasons: { text: string; quote: string }[] }[];
    };
    const out: RerankResult = new Map();
    for (const s of parsed.scores ?? []) {
      const hit = labels.find((l) => l.key === s.candidate || l.c.id === s.candidate || l.c.name === s.candidate);
      if (!hit || out.has(hit.c.id)) continue;
      const reasons = groundReasons(s.reasons ?? [], newMember, hit.c);
      const score = reasons.length === 0 ? 0 : Math.max(0, Math.min(10, Number(s.score) || 0));
      out.set(hit.c.id, { score, reasons });
    }
    for (const { c } of labels) if (!out.has(c.id)) out.set(c.id, { score: 0, reasons: [] });
    return out;
  } catch (err) {
    console.error("rerank failed, falling back to tags:", (err as Error).message);
    return null;
  }
}
