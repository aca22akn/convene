import { splitQuote } from "@/lib/ui";

/** Renders text with the quote highlighted when it is an exact substring. */
export function Quoted({ text, quote }: { text: string; quote?: string | null }) {
  return (
    <>
      {splitQuote(text, quote).map((s, i) =>
        s.quoted ? (
          <mark key={i} className="rounded bg-amber-300/20 px-1 text-amber-200">
            “{s.text}”
          </mark>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}

/** A quote as a standalone highlighted span. */
export function QuotePill({ quote }: { quote: string }) {
  return <mark className="rounded bg-amber-300/20 px-1 text-amber-200">“{quote}”</mark>;
}
