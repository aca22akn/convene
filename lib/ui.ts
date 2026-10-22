// Pure UI helpers (tested in tests/ui.test.ts).
import type { Reason } from "./types";

export type Segment = { text: string; quoted: boolean };

/** Split `text` around the first exact occurrence of `quote`, so the quote can be highlighted. */
export function splitQuote(text: string, quote: string | null | undefined): Segment[] {
  if (!quote) return [{ text, quoted: false }];
  const i = text.indexOf(quote);
  if (i < 0) return [{ text, quoted: false }];
  const out: Segment[] = [];
  if (i > 0) out.push({ text: text.slice(0, i), quoted: false });
  out.push({ text: quote, quoted: true });
  if (i + quote.length < text.length) out.push({ text: text.slice(i + quote.length), quoted: false });
  return out;
}

/** First grounded quote of an intro, falling back to the first reason text. */
export function headlineQuote(reasons: Reason[]): string {
  const g = reasons.find((r) => r.grounded && r.quote);
  if (g?.quote) return `“${g.quote}”`;
  return reasons[0]?.text ?? "";
}

export type TagRow = { tag: string; needs: number; offers: number };

/** Merge needs/offers counts into rows sorted by demand, then offers, then name. */
export function tagRows(needs: Record<string, number>, offers: Record<string, number>): TagRow[] {
  const tags = new Set([...Object.keys(needs), ...Object.keys(offers)]);
  return [...tags]
    .map((tag) => ({ tag, needs: needs[tag] ?? 0, offers: offers[tag] ?? 0 }))
    .sort((a, b) => b.needs - a.needs || b.offers - a.offers || a.tag.localeCompare(b.tag));
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

export function xUrl(handle: string): string {
  return `https://x.com/${handle.replace(/^@/, "")}`;
}
