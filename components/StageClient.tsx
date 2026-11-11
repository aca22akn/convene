"use client";
import { useSyncExternalStore } from "react";
import { QRCodeSVG } from "qrcode.react";
import { mockLive, type LiveView } from "@/lib/mocks";
import { useLive } from "@/lib/useLive";
import { Brand } from "./Brand";
import { Graph } from "./Graph";

const subscribeToLocation = () => () => {};
const getOrigin = () => window.location.origin;
const getServerOrigin = () => "";

export function StageClient({ slug, mock }: { slug: string; mock: boolean }) {
  const origin = useSyncExternalStore(subscribeToLocation, getOrigin, getServerOrigin);
  const { data, error } = useLive<LiveView>(`/api/e/${slug}/live`, { mock: mock ? mockLive : undefined });

  const joinUrl = origin ? `${origin}/e/${slug}` : "";
  const eventName = data?.event.name ?? "this event";
  const members = data?.members ?? [];
  const intros = [...(data?.intros ?? [])].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  const byId = new Map(members.map((m) => [m.id, m]));

  return (
    <main id="main" className="grid min-h-screen grid-cols-1 gap-6 p-6 lg:h-screen lg:grid-cols-[minmax(340px,38%)_1fr] lg:p-10">
      <section className="flex flex-col">
        <div className="flex items-center justify-between">
          <Brand />
          <span className="text-white/50">{data?.event.name}</span>
        </div>
        <h1 className="mt-6 text-4xl font-bold leading-tight lg:text-5xl">Scan to meet the right people here</h1>
        <div className="mt-6 self-start rounded-3xl bg-white p-5">
          {joinUrl ? <QRCodeSVG value={joinUrl} size={360} level="M" aria-label={`QR code to join ${eventName}`} className="h-auto w-full max-w-[360px]" /> : <div className="h-[360px] w-[360px]" />}
        </div>
        <a href={joinUrl} className="mt-4 break-all font-mono text-xl text-white/70 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">{joinUrl.replace(/^https?:\/\//, "")}</a>
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
        <div className="flex min-h-0 max-h-[38%] flex-col rounded-3xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-white/50">Latest intros</h2>
          {intros.length === 0 && <p className="mt-3 text-2xl text-white/50">Intros appear here as people join.</p>}
          {intros.length > 3 && <p className="mt-1 text-sm text-white/55">{intros.length - 3} more below</p>}
          <ul aria-label="Latest introductions" tabIndex={0} className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto pr-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-inset">
            {intros.map((i) => {
              const a = byId.get(i.a_id);
              const b = byId.get(i.b_id);
              return (
                <li key={`${i.a_id}-${i.b_id}`} className="animate-in-soft text-2xl leading-snug">
                  <span className="font-semibold">
                    {a?.display_name ?? "?"} ↔ {b?.display_name ?? "?"}
                  </span>
                  <span className="text-white/45"> · </span>
                  <span className="block line-clamp-2 text-amber-200" title={i.headline}>{i.headline}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </main>
  );
}
