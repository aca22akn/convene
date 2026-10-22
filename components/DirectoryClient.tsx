"use client";
import { useState } from "react";
import { mockDirectory, type DirectoryView } from "@/lib/mocks";
import { useLive } from "@/lib/useLive";
import { xUrl } from "@/lib/ui";
import { Brand } from "./Brand";
import { inputCls } from "./JoinForm";

export function DirectoryClient({ slug, mock }: { slug: string; mock: boolean }) {
  const { data, error } = useLive<DirectoryView>(`/api/c/${slug}`, { mock: mock ? mockDirectory : undefined, intervalMs: 10000 });
  const [filter, setFilter] = useState("");
  const f = filter.trim().toLowerCase();
  const people = (data?.people ?? [])
    .filter((p) => !f || [p.name, p.latest_line, p.speak_on ?? "", p.x_handle ?? ""].some((s) => s.toLowerCase().includes(f)))
    .sort((a, b) => b.events_count - a.events_count || a.name.localeCompare(b.name));

  return (
    <main className="mx-auto w-full max-w-5xl p-5 lg:p-8">
      <Brand />
      <h1 className="mt-6 text-3xl font-bold">{data?.community.name ?? slug}</h1>
      <p className="text-white/60">{data?.people.length ?? 0} members, remembered across events.</p>
      {error && !data && <p className="mt-4 text-red-300">{error}</p>}
      <input className={`${inputCls} mt-6`} placeholder="Search names, what people build, talks…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      <ul className="mt-6 divide-y divide-white/10 rounded-2xl border border-white/10">
        {people.map((p) => (
          <li key={p.person_id} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-start sm:gap-4">
            <div className="sm:w-56 sm:shrink-0">
              <p className="font-semibold">{p.name}</p>
              {p.x_handle && (
                <a className="text-sm text-sky-300 underline" href={xUrl(p.x_handle)} target="_blank" rel="noreferrer">
                  @{p.x_handle.replace(/^@/, "")}
                </a>
              )}
            </div>
            <div className="flex-1">
              <p className="text-white/80">{p.latest_line}</p>
              {p.speak_on && <p className="mt-1 text-sm text-amber-200">Speaks on: {p.speak_on}</p>}
            </div>
            <span className={`self-start rounded-full px-3 py-1 text-sm ${p.events_count > 1 ? "bg-emerald-400/15 text-emerald-200" : "bg-white/10 text-white/60"}`}>
              seen at {p.events_count} event{p.events_count === 1 ? "" : "s"}
            </span>
          </li>
        ))}
        {data && people.length === 0 && <li className="p-4 text-white/50">No members found.</li>}
      </ul>
    </main>
  );
}
