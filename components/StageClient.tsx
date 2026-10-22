"use client";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { mockLive, type LiveView } from "@/lib/mocks";
import { useLive } from "@/lib/useLive";
import { firstName, headlineQuote } from "@/lib/ui";
import { Brand } from "./Brand";
import { Graph } from "./Graph";

export function StageClient({ slug, mock }: { slug: string; mock: boolean }) {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  const [eventId, setEventId] = useState<string | null>(null);
  const { data, error } = useLive<LiveView>(`/api/e/${slug}/live`, { mock: mock ? mockLive : undefined, eventId });
  useEffect(() => {
    if (data?.event.id) setEventId(data.event.id);
  }, [data?.event.id]);

  const joinUrl = origin ? `${origin}/e/${slug}` : "";
  const members = data?.members ?? [];
  const intros = [...(data?.intros ?? [])].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  const byId = new Map(members.map((m) => [m.id, m]));

  return (
    <main className="grid min-h-screen grid-cols-1 gap-6 p-6 lg:h-screen lg:grid-cols-[minmax(340px,38%)_1fr] lg:p-10">
      <section className="flex flex-col">
        <div className="flex items-center justify-between">
          <Brand />
          <span className="text-white/50">{data?.event.name}</span>
        </div>
        <h1 className="mt-6 text-4xl font-bold leading-tight lg:text-5xl">Scan to meet the right people here</h1>
        <div className="mt-6 self-start rounded-3xl bg-white p-5">
          {joinUrl ? <QRCodeSVG value={joinUrl} size={360} level="M" className="h-auto w-full max-w-[360px]" /> : <div className="h-[360px] w-[360px]" />}
        </div>
        <p className="mt-4 break-all font-mono text-xl text-white/70">{joinUrl.replace(/^https?:\/\//, "")}</p>
        <div className="mt-auto pt-6">
          <p className="text-7xl font-bold tabular-nums text-emerald-400">{data?.count ?? 0}</p>
          <p className="text-2xl text-white/70">people here · {data?.intros.length ?? 0} intros made</p>
          {error && !data && <p className="mt-2 text-sm text-red-300">{error}</p>}
        </div>
      </section>

      <section className="flex min-h-0 flex-col gap-4">
        <div className="min-h-[320px] flex-1 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
          <Graph members={members} intros={data?.intros ?? []} />
        </div>
        <div className="max-h-[38%] overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-white/50">Latest intros</h2>
          {intros.length === 0 && <p className="mt-3 text-2xl text-white/50">Intros appear here as people join.</p>}
          <ul className="mt-3 space-y-3">
            {intros.slice(0, 5).map((i) => {
              const a = byId.get(i.a_id);
              const b = byId.get(i.b_id);
              return (
                <li key={`${i.a_id}-${i.b_id}`} className="animate-in-soft text-2xl leading-snug">
                  <span className="font-semibold">
                    {a ? firstName(a.name) : "?"} ↔ {b ? firstName(b.name) : "?"}
                  </span>
                  <span className="text-white/45"> · </span>
                  <span className="text-amber-200">{headlineQuote(i.reasons)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </main>
  );
}
