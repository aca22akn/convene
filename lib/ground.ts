// Grounding check: a model-written reason survives only if its quote is copied verbatim from what someone wrote.
import type { Member, Reason } from "./types";

export type RawReason = { text: string; quote: string | null | undefined };

export function isGrounded(quote: string | null | undefined, a: Pick<Member, "line">, b: Pick<Member, "line">): boolean {
  const q = (quote ?? "").trim();
  if (q.length < 4) return false;
  return a.line.includes(q) || b.line.includes(q);
}

/** Keep at most 2 reasons whose quote is an exact substring of either member's line. */
export function groundReasons(raw: RawReason[], a: Pick<Member, "line">, b: Pick<Member, "line">): Reason[] {
  const out: Reason[] = [];
  for (const r of raw ?? []) {
    if (!r || typeof r.text !== "string" || !r.text.trim()) continue;
    if (!isGrounded(r.quote, a, b)) continue;
    out.push({ text: r.text.trim(), quote: (r.quote as string).trim(), grounded: true });
    if (out.length === 2) break;
  }
  return out;
}
