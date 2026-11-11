"use client";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { MeView } from "@/lib/types";
import { mockMe } from "@/lib/mocks";
import { useLive } from "@/lib/useLive";
import { firstName } from "@/lib/ui";
import { Brand } from "./Brand";
import { IntroCard } from "./IntroCard";
import { WifiOffIcon } from "./icons";
import { Callout, Spinner, useOnline } from "./ui";

/** After joining, intros are computed in the background; past this we say it is taking longer than usual. */
const TAKING_LONGER_MS = 20_000;

function Finding({ justJoined, longer }: { justJoined: boolean; longer: boolean }) {
  return (
    <section role="status" aria-label="Loading your intros" className="card mt-6 p-5">
      <div className="flex items-center gap-3">
        <Spinner className="text-gold" />
        <p className="text-xl font-bold">{justJoined ? "Finding your intros" : "Loading your intros…"}</p>
      </div>
      {justJoined && (
        <p className="mt-3 text-fg-2">We’re reading your line and comparing it with everyone who’s here. This usually takes about 10 seconds.</p>
      )}
      {justJoined && longer && (
        <p className="mt-2 text-fg-2">Taking longer than usual. Keep this page open; your intros appear here as soon as they’re ready.</p>
      )}
      <div aria-hidden="true" className="mt-5 space-y-3">
        <div className="skeleton h-5 w-2/3" />
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-4 w-5/6" />
      </div>
    </section>
  );
}

export function MeClient({ slug, id: idProp, mock, justJoined = false }: { slug: string; id: string | null; mock: boolean; justJoined?: boolean }) {
  const subscribeToStoredId = useCallback((onStoreChange: () => void) => {
    window.addEventListener("storage", onStoreChange);
    return () => window.removeEventListener("storage", onStoreChange);
  }, []);
  const getStoredId = useCallback(() => {
    try {
      return localStorage.getItem(`convene:${slug}`) ?? "";
    } catch {
      return "";
    }
  }, [slug]);
  const storedId = useSyncExternalStore(subscribeToStoredId, getStoredId, () => null);
  const id = idProp ?? (storedId || null);
  const checked = idProp !== null || storedId !== null;
  const online = useOnline();

  const { data, error, refetch } = useLive<MeView>(id ? `/api/e/${slug}/me?id=${encodeURIComponent(id)}` : null, {
    mock: mock ? mockMe : undefined,
  });

  const [longer, setLonger] = useState(false);
  useEffect(() => {
    if (!justJoined) return;
    const timer = setTimeout(() => setLonger(true), TAKING_LONGER_MS);
    return () => clearTimeout(timer);
  }, [justJoined]);

  if (checked && !id && !mock) {
    return (
      <main id="main" className="mx-auto w-full max-w-lg flex-1 px-4 pb-10 pt-2">
        <Brand small />
        <h1 className="mt-6 text-[2rem] font-extrabold leading-[1.1] tracking-tight">Your intros</h1>
        <section className="card mt-6 p-5">
          <p className="text-lg font-bold">You haven&apos;t joined this event on this phone yet.</p>
          <p className="mt-2 text-fg-2">Join with one line about what you’re building and what you need, and your intros will show up here.</p>
          <a href={`/e/${slug}`} className="btn btn-primary btn-lg mt-4">Join this event</a>
        </section>
      </main>
    );
  }

  const matches = data?.matches ?? [];
  const stillFinding = justJoined && !longer && matches.length === 0;
  const names = matches.map((m) => firstName(m.member.name));

  return (
    <main id="main" className="mx-auto w-full max-w-lg flex-1 px-4 pb-10 pt-2">
      <Brand small />
      <h1 className="mt-4 text-[2rem] font-extrabold leading-[1.1] tracking-tight">Your intros</h1>
      {data && <p className="mt-2 text-fg-2">Hi {firstName(data.member.name)}. Up to 2 people worth meeting here, and why.</p>}

      {data && (
        <section className="mt-5 rounded-2xl border border-ink-700 p-4" aria-label="What you wrote">
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-fg-3">You wrote</p>
          <p className="mt-1 font-serif text-lg leading-snug">“{data.member.line}”</p>
        </section>
      )}

      {data && (error || !online) && (
        <Callout tone="warn" className="mt-5">
          <p className="flex items-center gap-2 font-semibold">
            {!online && <WifiOffIcon className="h-4 w-4" />}
            {!online ? "You’re offline" : "Can’t refresh right now"}
          </p>
          <p className="text-fg-2">Showing the intros we already have. They update when you’re back online.</p>
        </Callout>
      )}

      {!data && !error && <Finding justJoined={justJoined} longer={longer} />}

      {error && !data && (
        <section role="alert" className="mt-6 rounded-2xl border border-danger/50 bg-danger/10 p-5">
          <p className="text-lg font-bold">We couldn’t load your intros</p>
          <p className="mt-1 text-fg-2">{error}. Your line is saved. Check you’re online and try again.</p>
          <button type="button" onClick={() => void refetch()} className="btn btn-secondary mt-4">Retry</button>
        </section>
      )}

      {data && stillFinding && <Finding justJoined longer={false} />}

      {data && matches.length === 0 && !stillFinding && (
        <section className="card mt-6 p-5">
          <p className="text-xl font-bold">No intros yet</p>
          <p className="mt-2 text-fg-2">Intros appear on this page as people join. Keep it open, or come back later.</p>
          <p className="mt-1 text-fg-2">
            {data.event.member_count < 3
              ? "This is still a small room, so more intros can appear as attendees arrive."
              : "The room has enough people for intros, so we’ll show new ones as they are made."}
          </p>
        </section>
      )}

      {data && matches.length > 0 && (
        <>
          <p role="status" className="sr-only">{matches.length === 1 ? "1 intro" : `${matches.length} intros`}</p>
          <div className="mt-6 space-y-5">
            {matches.map((m, i) => (
              <IntroCard key={m.member.id} match={m} myLine={data.member.line} label={`Intro ${i + 1} of ${matches.length}`} />
            ))}
          </div>
          <p className="mt-6 text-fg-2">
            Find {names.join(" and ")} in the room: look for {names.length === 1 ? "their name" : "their names"} on the stage screen, or ask the organiser.
          </p>
        </>
      )}
    </main>
  );
}
