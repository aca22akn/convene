import { grok, GROK_MODEL } from "./grok";
import { aiCallAllowed } from "./ai-budget";
import { keywordExtract } from "./keywords";
import { TAGS, type Extraction, type Tag } from "./types";

const tagArray = { type: "array", items: { type: "string", enum: [...TAGS] } };

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["offers", "seeks", "topics", "speak_topics"],
  properties: { offers: tagArray, seeks: tagArray, topics: tagArray, speak_topics: tagArray },
};

const SYSTEM = `You tag community members at a live London tech event.
Map what they wrote to a FIXED vocabulary of tags. Use only these tags: ${TAGS.join(", ")}.
- offers: what they bring or could help others with (skills, their product, capital, audience, venue).
- seeks: what they explicitly need ("need X", "looking for X").
- topics: broader themes of their work (include offers and seeks themes).
- speak_topics: tags for what they are happy to speak on (empty if nothing given).
Be precise; 1-4 tags per field. Return JSON only.`;

const valid = (xs: unknown): Tag[] =>
  Array.isArray(xs) ? Array.from(new Set(xs.filter((x): x is Tag => (TAGS as readonly string[]).includes(x as string)))) : [];

export async function extract(
  line: string,
  speak_on?: string | null,
  options: { eventId?: string; signal?: AbortSignal; enabled?: boolean } = {},
): Promise<Extraction & { source: "grok" | "keywords"; ms: number }> {
  const t0 = Date.now();
  const client = options.enabled === false ? null : grok();
  const budgetAllowed = client && options.eventId ? await aiCallAllowed(options.eventId) : !!client && !options.eventId;
  if (client && budgetAllowed) {
    try {
      const res = await client.chat.completions.create({
        model: GROK_MODEL,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: JSON.stringify({ line, speak_on: speak_on || "" }) },
        ],
        response_format: { type: "json_schema", json_schema: { name: "extraction", strict: true, schema: SCHEMA } },
      }, options.signal ? { signal: options.signal } : undefined);
      const raw = JSON.parse(res.choices[0]?.message?.content || "{}");
      const out: Extraction = {
        offers: valid(raw.offers),
        seeks: valid(raw.seeks),
        topics: valid(raw.topics),
        speak_topics: valid(raw.speak_topics),
      };
      if (out.offers.length + out.seeks.length + out.topics.length > 0) {
        return { ...out, source: "grok", ms: Date.now() - t0 };
      }
    } catch (e) {
      console.warn("[extract] grok failed, using keywords:", (e as Error).message);
    }
  }
  return { ...keywordExtract(line, speak_on), source: "keywords", ms: Date.now() - t0 };
}

/** Run every item and preserve failures by input index; no worker rejects early. */
export type PoolResult<T, R> = { row: T; ok: true; value: R } | { row: T; ok: false; error: unknown };

export async function pool<T, R>(items: T[], n: number, fn: (x: T, i: number) => Promise<R>): Promise<PoolResult<T, R>[]> {
  const out: PoolResult<T, R>[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        try { out[i] = { row: items[i], ok: true, value: await fn(items[i], i) }; }
        catch (error) { out[i] = { row: items[i], ok: false, error }; }
      }
    }),
  );
  return out;
}
