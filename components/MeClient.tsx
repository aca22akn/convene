"use client";
import { useEffect, useState } from "react";
import type { MeView } from "@/lib/types";
import { mockMe } from "@/lib/mocks";
import { useLive } from "@/lib/useLive";
import { firstName, xUrl } from "@/lib/ui";
import { Brand } from "./Brand";
import { Quoted } from "./Quoted";

export function MeClient({ slug, id: idProp, mock }: { slug: string; id: string | null; mock: boolean }) {
  const [id, setId] = useState<string | null>(idProp);
  const [checked, setChecked] = useState(!!idProp);

  useEffect(() => {
    if (idProp) return;
    try {
      setId(localStorage.getItem(`convene:${slug}`));
    } catch {}
    setChecked(true);
  }, [idProp, slug]);

  const { data, error } = useLive<MeView>(id ? `/api/e/${slug}/me?id=${encodeURIComponent(id)}` : null, {
    mock: mock ? mockMe : undefined,
  });

  if (checked && !id && !mock) {
    return (
      <main className="mx-auto w-full max-w-lg px-5 py-8">
        <Brand small />
        <p className="mt-8 text-xl">You haven&apos;t joined this event on this phone yet.</p>
        <a href={`/e/${slug}`} className="mt-4 inline-block rounded-xl bg-emerald-400 px-5 py-3 font-semibold text-black">
          Join now
        </a>
      </main>
    );
  }

  const matches = data?.matches ?? [];
  return (
    <main className="mx-auto w-full max-w-lg px-5 py-8">
      <Brand small />
      {data && (
        <>
          <p className="mt-6 text-white/60">Hi {firstName(data.member.name)}, you wrote:</p>
          <p className="mt-1 text-lg italic text-white/80">“{data.member.line}”</p>
        </>
      )}

      <h1 className="mt-8 text-3xl font-bold">People to meet</h1>

      {matches.length === 0 && (
        <div className="mt-6 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-5">
          <span className="relative flex h-4 w-4 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-4 w-4 rounded-full bg-emerald-400" />
          </span>
          <span className="text-lg">Finding your people… this page updates by itself.</span>
        </div>
      )}
      {error && !data && <p className="mt-4 text-sm text-red-300">{error}</p>}

      <div className="mt-6 space-y-5">
        {matches.map((m) => {
          const lineQuote = m.reasons.find((r) => r.grounded && r.quote && m.member.line.includes(r.quote))?.quote;
          return (
            <article key={m.member.id} className="animate-in-soft rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <h2 className="text-2xl font-semibold">{m.member.name}</h2>
                {m.member.x_handle && (
                  <a href={xUrl(m.member.x_handle)} target="_blank" rel="noreferrer" className="text-sky-300 underline">
                    @{m.member.x_handle.replace(/^@/, "")}
                  </a>
                )}
              </div>
              <p className="mt-2 text-white/75">
                <Quoted text={m.member.line} quote={lineQuote} />
              </p>
              <ul className="mt-4 space-y-3">
                {m.reasons.slice(0, 2).map((r, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="mt-0.5 text-emerald-400">✓</span>
                    <div>
                      <p className="text-white/90">{r.text}</p>
                      {r.quote && r.grounded && (
                        <p className="mt-1 text-sm">
                          <mark className="rounded bg-amber-300/20 px-1 text-amber-200">“{r.quote}”</mark>
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>

      {matches.length > 0 && <p className="mt-6 text-white/55">Find them: ask the organiser, or look for their name on the stage screen.</p>}
    </main>
  );
}
