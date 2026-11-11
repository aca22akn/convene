"use client";
import { useState } from "react";
import { mockDirectory, type DirectoryView } from "@/lib/mocks";
import { useLive } from "@/lib/useLive";
import { xUrl } from "@/lib/ui";
import { Brand } from "./Brand";
import { SearchIcon } from "./icons";
import { Callout, Eyebrow, inputCls } from "./ui";

export function DirectoryClient({ slug, mock }: { slug: string; mock: boolean }) {
  const { data, error } = useLive<DirectoryView>(`/api/c/${slug}`, { mock: mock ? mockDirectory : undefined, intervalMs: 30_000 });
  const [filter, setFilter] = useState("");
  const [pageStateBySlug, setPageStateBySlug] = useState<Record<string, { pages: DirectoryView[]; loading: boolean; error: string | null }>>({});
  const pageState = pageStateBySlug[slug] ?? { pages: [], loading: false, error: null };
  const { pages: extraPages, loading: loadingPage, error: pageError } = pageState;
  const nextCursor = extraPages.at(-1)?.next_cursor ?? data?.next_cursor ?? null;
  const f = filter.trim().toLowerCase();
  const people = [...(data?.people ?? []), ...extraPages.flatMap((page) => page.people)]
    .filter((p) => !f || [p.name, p.latest_line, p.speak_on ?? "", p.x_handle ?? ""].some((s) => s.toLowerCase().includes(f)));

  const loadMore = async () => {
    if (!nextCursor || loadingPage) return;
    const updatePageState = (update: (state: typeof pageState) => typeof pageState) => {
      setPageStateBySlug((current) => ({ ...current, [slug]: update(current[slug] ?? { pages: [], loading: false, error: null }) }));
    };
    updatePageState((state) => ({ ...state, loading: true, error: null }));
    try {
      const response = await fetch(`/api/c/${encodeURIComponent(slug)}?cursor=${encodeURIComponent(nextCursor)}`, {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Could not load more directory members.");
      const page = await response.json() as DirectoryView;
      updatePageState((state) => ({ ...state, pages: [...state.pages, page], loading: false }));
    } catch (loadError) {
      updatePageState((state) => ({ ...state, loading: false, error: loadError instanceof Error ? loadError.message : "Could not load more directory members." }));
    }
  };

  return (
    <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 pb-12 pt-2 sm:px-6 lg:px-8">
      <Brand />
      <Eyebrow className="mt-6">Community directory</Eyebrow>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">{data?.community.name ?? slug}</h1>
      <p className="mt-2 text-fg-2">{data?.total ?? data?.people.length ?? 0} members opted into the directory.</p>
      <p className="mt-1 text-sm text-fg-3">Only members who opt in appear in this directory.</p>
      {error && !data && <Callout tone="error" className="mt-4">{error}</Callout>}
      <label htmlFor="directory-search" className="mt-6 block text-sm font-semibold">Search the directory</label>
      <div className="relative mt-1.5">
        <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-fg-3" />
        <input id="directory-search" type="search" className={`${inputCls} pl-11`} placeholder="Search names, what people build, talks…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      {!data && !error && <div aria-hidden="true" className="mt-6 space-y-3"><div className="skeleton h-20" /><div className="skeleton h-20" /></div>}
      <ul className="card mt-6 divide-y divide-ink-700 empty:hidden">
        {people.map((p, index) => (
          <li key={`${p.name}-${index}`} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-start sm:gap-4">
            <div className="sm:w-56 sm:shrink-0">
              <p className="font-bold">{p.name}</p>
              {p.x_handle && (
                <a className="text-sm font-semibold text-thread underline underline-offset-2" href={xUrl(p.x_handle)} target="_blank" rel="noreferrer">
                  @{p.x_handle.replace(/^@/, "")}
                </a>
              )}
            </div>
            <div className="flex-1">
              <p className="font-serif text-[1.0625rem] leading-snug text-fg-2">{p.latest_line}</p>
              {p.speak_on && <p className="mt-1 text-sm text-fg-2">Speaks on: <span className="font-serif text-fg">{p.speak_on}</span></p>}
            </div>
            <span className={`chip self-start ${p.events_count > 1 ? "chip-gold" : ""}`}>
              seen at {p.events_count} event{p.events_count === 1 ? "" : "s"}
            </span>
          </li>
        ))}
        {data && people.length === 0 && <li className="p-4 text-fg-2">{f ? `No members match “${filter.trim()}”.` : "Nobody has opted into the directory yet."}</li>}
      </ul>
      {nextCursor && (
        <div className="mt-4">
          <button className="btn btn-secondary w-full" type="button" disabled={loadingPage} onClick={() => void loadMore()}>
            {loadingPage ? "Loading…" : "Load more members"}
          </button>
          {pageError && <p className="mt-2 text-sm font-semibold text-danger" role="alert">{pageError}</p>}
        </div>
      )}
    </main>
  );
}
