import type { MeView } from "@/lib/types";
import { firstName, quoteOwner, xUrl } from "@/lib/ui";
import { ExternalIcon } from "./icons";
import { QuotePill } from "./Quoted";

export type IntroMatch = MeView["matches"][number];

/**
 * One intro, as a paper card. The reasons are the star: each is a sentence from the app (sans)
 * followed by the words a person wrote (serif, highlighted) and whose words they are.
 */
export function IntroCard({
  match,
  myLine,
  label,
  showLinks = true,
  headingLevel = 2,
}: {
  match: IntroMatch;
  myLine: string;
  label?: string;
  showLinks?: boolean;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const first = firstName(match.member.name);
  const reasons = match.reasons.slice(0, 2);
  return (
    <article className="paper arrive reveal p-5 sm:p-6">
      {label && <p className="text-sm font-bold uppercase tracking-[0.14em] text-paper-2">{label}</p>}
      <div className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 ${label ? "mt-2" : ""}`}>
        <Heading className="text-3xl font-extrabold leading-tight tracking-tight">{match.member.name}</Heading>
        {showLinks && match.member.x_handle && (
          <a href={xUrl(match.member.x_handle)} target="_blank" rel="noreferrer" className="btn btn-secondary">
            @{match.member.x_handle.replace(/^@/, "")} on X
            <ExternalIcon className="h-4 w-4" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        )}
      </div>
      <p className="mt-2 font-serif text-[1.0625rem] leading-snug text-paper-2">{match.member.line}</p>

      <p className="mt-6 text-sm font-bold uppercase tracking-[0.14em] text-paper-2">Why you two</p>
      <ul className="arrive-stagger mt-3 space-y-5">
        {reasons.map((r, i) => {
          const owner = r.grounded && r.quote ? quoteOwner(r.quote, myLine, match.member.line) : null;
          return (
            <li key={i} className="arrive">
              <p className="text-[1.1875rem] font-semibold leading-snug">{r.text}</p>
              {r.quote && r.grounded && (
                <blockquote className="mt-2 border-l-4 border-paper-ink pl-3.5">
                  <p className="font-serif text-[1.3125rem] leading-snug">
                    <QuotePill quote={r.quote} />
                  </p>
                  {owner && <footer className="mt-1 text-sm font-semibold text-paper-2">{owner === "you" ? "You wrote this" : `${first} wrote this`}</footer>}
                </blockquote>
              )}
            </li>
          );
        })}
      </ul>
    </article>
  );
}
