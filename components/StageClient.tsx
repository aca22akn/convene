"use client";
import { useId, useState, useSyncExternalStore } from "react";
import { QRCodeSVG } from "qrcode.react";
import { mockLive, type LiveIntro, type LiveMember, type LiveView } from "@/lib/mocks";
import { useLive } from "@/lib/useLive";
import { Brand, BrandMark } from "./Brand";

const subscribeToLocation = () => () => {};
const getOrigin = () => window.location.origin;
const getServerOrigin = () => "";

/** How many arrivals the footer roster names before summarising the rest. */
const ROSTER_MAX = 18;
const EARLIER_MAX = 2;

const introKey = (i: LiveIntro) => `${i.a_id}-${i.b_id}`;

/** A server headline is either a grounded quote (wrapped in curly quotes) or a reason sentence. */
function Headline({ text }: { text: string }) {
  const quoted = text.startsWith("“");
  return quoted ? <mark className="mark-quote">{text}</mark> : <>{text}</>;
}

function Pair({ intro, byId, onPaper = false }: { intro: LiveIntro; byId: Map<string, LiveMember>; onPaper?: boolean }) {
  return (
    <>
      {byId.get(intro.a_id)?.display_name ?? "Someone"}
      <BrandMark onPaper={onPaper} className="mx-[0.35em] inline-block h-[0.6em] w-[0.9em] align-middle" />
      {byId.get(intro.b_id)?.display_name ?? "someone"}
    </>
  );
}

export function StageClient({ slug, mock }: { slug: string; mock: boolean }) {
  const origin = useSyncExternalStore(subscribeToLocation, getOrigin, getServerOrigin);
  const { data, error } = useLive<LiveView>(`/api/e/${slug}/live`, { mock: mock ? mockLive : undefined });
  const [showAll, setShowAll] = useState(false);
  const allId = useId();

  const joinUrl = origin ? `${origin}/e/${slug}` : "";
  const eventName = data?.event.name ?? "this event";
  const members = data?.members ?? [];
  const intros = [...(data?.intros ?? [])].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  const byId = new Map(members.map((m) => [m.id, m]));
  const [latest, ...earlier] = intros;
  // Members arrive oldest first; the roster shows the newest first so arrivals land at the front.
  const roster = [...members].reverse().slice(0, ROSTER_MAX);
  const count = data?.count ?? members.length;

  return (
    <main id="main" className="stage grid min-h-dvh grid-cols-[minmax(0,1fr)] grid-rows-[auto_1fr_auto] gap-6 p-4 sm:p-6 lg:h-dvh lg:gap-[1.25em] lg:overflow-hidden lg:p-[2em]">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-[1em]">
          <Brand />
          <span aria-hidden="true" className="hidden h-[1.2em] w-px bg-ink-700 sm:block" />
          <span className="text-[1.25em] font-semibold text-fg-2">{data?.event.name}</span>
        </div>
        <p role="status" className={`chip text-[0.9em] ${error ? "border-gold/60 text-gold" : "text-ok"}`}>
          <span className="dot" aria-hidden="true" />
          {error ? "Reconnecting…" : data ? "Live" : "Connecting…"}
        </p>
      </header>

      <div className="grid min-h-0 grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,34%)_minmax(0,1fr)] lg:gap-[2.5em]">
        {/* Join: the one thing everyone in the room needs first. */}
        <section aria-labelledby="stage-join" className="flex min-h-0 flex-col">
          <h1 id="stage-join" className="text-[2.1em] font-extrabold leading-[1.08] tracking-tight lg:text-[2.6em]">Scan to meet the right people here</h1>
          <div className="mt-[1em] w-full max-w-[19em] rounded-[1.2em] bg-white p-[0.9em] lg:max-h-[42vh] lg:max-w-[min(100%,42vh)]">
            {joinUrl ? (
              <QRCodeSVG value={joinUrl} size={360} level="M" aria-label={`QR code to join ${eventName}`} className="h-auto w-full" />
            ) : (
              <div className="aspect-square w-full" />
            )}
          </div>
          <a href={joinUrl} className="mt-[0.75em] break-all text-[1.35em] font-bold text-fg underline decoration-gold decoration-2 underline-offset-[0.2em]">
            {joinUrl.replace(/^https?:\/\//, "")}
          </a>
          <p className="mt-[0.5em] text-[1.15em] text-fg-2">Write one line. Get up to 2 people to meet, and why.</p>
        </section>

        {/* Intros: the core moment, biggest thing on the wall. */}
        <section aria-labelledby="stage-intros" className="relative flex min-h-0 flex-col">
          <div className="flex items-center justify-between gap-4">
            <h2 id="stage-intros" className="text-[1em] font-bold uppercase tracking-[0.16em] text-fg-3">Latest intro</h2>
            {intros.length > 0 && (
              <button type="button" className="btn btn-ghost text-[0.9em]" aria-pressed={showAll} aria-controls={showAll ? allId : undefined} onClick={() => setShowAll((v) => !v)}>
                All intros ({intros.length})
              </button>
            )}
          </div>

          {latest ? (
            <article key={introKey(latest)} aria-label="Latest intro" className="paper arrive reveal mt-[0.6em] p-[1.4em] lg:p-[1.75em]">
              <p className="text-[2em] font-extrabold leading-tight tracking-tight lg:text-[2.5em]"><Pair intro={latest} byId={byId} onPaper /></p>
              <p className="mt-[0.4em] line-clamp-4 font-serif text-[1.6em] leading-[1.25] lg:text-[2.15em]" title={latest.headline}>
                <Headline text={latest.headline} />
              </p>
            </article>
          ) : (
            <div className="mt-[0.6em] rounded-[1.25em] border-2 border-dashed border-ink-700 p-[1.75em]">
              <p className="text-[2em] font-extrabold leading-tight">Intros appear here as people join.</p>
              <ol className="mt-[1em] space-y-[0.5em] text-[1.3em] text-fg-2">
                <li><span className="font-serif italic text-gold">1</span> Scan the code</li>
                <li><span className="font-serif italic text-gold">2</span> Write one line: building X, need Y</li>
                <li><span className="font-serif italic text-gold">3</span> Meet up to 2 people, with reasons</li>
              </ol>
            </div>
          )}

          {earlier.length > 0 && (
            <>
              <h3 className="mt-[1.25em] text-[0.9em] font-bold uppercase tracking-[0.16em] text-fg-3">Earlier intros</h3>
              <ul aria-label="Earlier intros" className="mt-[0.4em] divide-y divide-ink-700">
                {earlier.slice(0, EARLIER_MAX).map((intro) => (
                  <li key={introKey(intro)} className="py-[0.55em] text-[1.3em] leading-snug">
                    <span className="font-bold"><Pair intro={intro} byId={byId} /></span>
                    <span className="block truncate font-serif text-fg-2" title={intro.headline}>{intro.headline}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {showAll && (
            <div className="absolute inset-0 z-10 flex flex-col rounded-[1em] border border-ink-700 bg-ink-900 p-[1em]">
              <div className="flex items-center justify-between">
                <p className="text-[1em] font-bold uppercase tracking-[0.16em] text-fg-3">All intros</p>
                <button type="button" className="btn btn-secondary text-[0.9em]" onClick={() => setShowAll(false)}>Close list</button>
              </div>
              <ul
                id={allId}
                aria-label="Introduction list"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Escape" && setShowAll(false)}
                className="mt-[0.5em] min-h-0 flex-1 divide-y divide-ink-700 overflow-y-auto pr-2"
              >
                {intros.map((intro) => (
                  <li key={introKey(intro)} className="py-[0.6em] text-[1.15em] leading-snug">
                    <span className="font-bold"><Pair intro={intro} byId={byId} /></span>
                    <span className="block font-serif text-fg-2">{intro.headline}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      {/* Who's here: arrivals land at the front with one ring; the band never changes height. */}
      <footer className="flex min-w-0 flex-wrap items-center gap-[1.25em] lg:flex-nowrap border-t border-ink-700 pt-[1em]">
        <p className="flex-none leading-none">
          <span className="block text-[2.6em] font-extrabold tabular-nums text-gold">{count}</span>
          <span className="text-[1em] text-fg-2">here · {intros.length} {intros.length === 1 ? "intro" : "intros"}</span>
        </p>
        <ul aria-label="Who’s here" className="flex min-w-0 flex-1 flex-wrap content-center gap-[0.5em] lg:h-[2.6em] lg:overflow-hidden">
          {roster.map((m) => (
            <li key={m.id} className="chip chip-new text-[1.05em] text-fg">{m.display_name}</li>
          ))}
          {count > roster.length && <li className="chip text-[1.05em]">+{count - roster.length} more</li>}
        </ul>
        <p className="hidden max-w-[16em] flex-none text-right text-[0.85em] text-fg-3 xl:block">The room screen shows first names and a quote from each line.</p>
      </footer>
    </main>
  );
}
