"use client";
import { useState } from "react";
import { mockOrganiser, type OrganiserView } from "@/lib/mocks";
import { useLive } from "@/lib/useLive";
import { tagRows, xUrl } from "@/lib/ui";
import { Brand } from "./Brand";
import { inputCls } from "./JoinForm";

const card = "rounded-2xl border border-white/10 bg-white/[0.03] p-5";
const btn = "rounded-xl border border-white/15 bg-white/5 px-4 py-2 font-medium hover:bg-white/10";

const EXAMPLES = [
  "Who could speak about Postgres next month?",
  "What do members need that nobody offers?",
  "Who has come to more than one event and is looking for a cofounder?",
];

export function OrganiserClient({ slug, token, mock }: { slug: string; token: string; mock: boolean }) {
  const q = `token=${encodeURIComponent(token)}`;
  const { data, error, refetch } = useLive<OrganiserView>(token || mock ? `/api/e/${slug}/organiser?${q}` : null, {
    mock: mock ? mockOrganiser : undefined,
    intervalMs: 5000,
  });

  if (!token && !mock) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <Brand />
        <p className="mt-8 text-xl">This page needs the organiser link with its token (…/organiser?token=…).</p>
      </main>
    );
  }

  const rows = data ? tagRows(data.needs, data.offers) : [];
  const max = Math.max(1, ...rows.map((r) => Math.max(r.needs, r.offers)));
  const community = data?.event.community_slug;

  return (
    <main className="mx-auto w-full max-w-6xl p-5 lg:p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-4">
          <Brand />
          <h1 className="text-xl text-white/70">{data?.event.name ?? slug} · organiser</h1>
        </div>
        <nav className="flex flex-wrap gap-2">
          <a className={btn} href={`/e/${slug}/stage`} target="_blank" rel="noreferrer">Open stage</a>
          {community && <a className={btn} href={`/c/${community}`}>Community directory</a>}
        </nav>
      </header>
      {error && !data && <p className="mt-4 rounded-lg bg-red-500/15 px-4 py-2 text-red-200">{error}</p>}

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Members" value={data?.members.length ?? 0} />
        <Stat label="Intros" value={data?.intros.length ?? 0} />
        <Stat label="Speakers" value={data?.speakers.length ?? 0} />
        <Stat label="Shared contact" value={data?.members.filter((m) => m.contact_consent).length ?? 0} />
      </div>

      <AskBox community={community} token={token} />

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className={card}>
          <h2 className="text-lg font-semibold">Needs vs offers</h2>
          <div className="mt-2 flex gap-4 text-sm text-white/60">
            <span><span className="mr-1 inline-block h-3 w-3 rounded-sm bg-rose-400" />needs</span>
            <span><span className="mr-1 inline-block h-3 w-3 rounded-sm bg-emerald-400" />offers</span>
          </div>
          <ul className="mt-4 space-y-2">
            {rows.slice(0, 16).map((r) => (
              <li key={r.tag} className="grid grid-cols-[110px_1fr] items-center gap-3 text-sm">
                <span className="truncate text-white/80">{r.tag}</span>
                <div className="space-y-1">
                  <div className="h-2.5 rounded-full bg-rose-400" style={{ width: `${(r.needs / max) * 100}%`, minWidth: r.needs ? 6 : 0 }} title={`${r.needs} need`} />
                  <div className="h-2.5 rounded-full bg-emerald-400" style={{ width: `${(r.offers / max) * 100}%`, minWidth: r.offers ? 6 : 0 }} title={`${r.offers} offer`} />
                </div>
              </li>
            ))}
            {rows.length === 0 && <li className="text-white/50">No data yet.</li>}
          </ul>
          <h3 className="mt-6 font-semibold">Unmet needs</h3>
          <p className="text-sm text-white/55">Asked for, nobody in the room offers it. Good topics for the next event or sponsor ask.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(data?.unmet ?? []).map((t) => (
              <span key={t} className="rounded-full border border-rose-400/40 bg-rose-400/10 px-3 py-1 text-rose-200">{t}</span>
            ))}
            {data && data.unmet.length === 0 && <span className="text-white/50">None.</span>}
          </div>
        </section>

        <section className={card}>
          <h2 className="text-lg font-semibold">Speaker inbox</h2>
          <p className="text-sm text-white/55">People who said they&apos;re happy to speak, ranked by what the room wants to hear.</p>
          <ol className="mt-4 space-y-3">
            {(data?.speakers ?? []).map((s, i) => (
              <li key={s.id} className="rounded-xl border border-white/10 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold">{i + 1}. {s.name}</span>
                  {s.x_handle && <a className="text-sky-300 underline" href={xUrl(s.x_handle)} target="_blank" rel="noreferrer">@{s.x_handle.replace(/^@/, "")}</a>}
                </div>
                {s.speak_on && <p className="mt-1 text-amber-200">“{s.speak_on}”</p>}
                <div className="mt-2 flex flex-wrap gap-1">
                  {s.speak_topics.map((t) => <span key={t} className="rounded-full bg-white/10 px-2 py-0.5 text-xs">{t}</span>)}
                </div>
              </li>
            ))}
            {data && data.speakers.length === 0 && <li className="text-white/50">No volunteers yet.</li>}
          </ol>
        </section>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className={card}>
          <h2 className="text-lg font-semibold">Exports</h2>
          <p className="text-sm text-white/55">contacts.vcf contains only people who ticked consent. Import it on your phone, then add them to WhatsApp.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {["contacts.vcf", "members.csv", "intros.csv"].map((f) => (
              <a key={f} className={btn} href={`/api/e/${slug}/export/${f}?${q}`}>⬇ {f}</a>
            ))}
          </div>
        </section>
        <ImportBox slug={slug} q={q} onDone={refetch} />
      </div>

      <DangerZone slug={slug} q={q} />
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className={card}>
      <p className="text-4xl font-bold tabular-nums">{value}</p>
      <p className="text-white/60">{label}</p>
    </div>
  );
}

function AskBox({ community, token }: { community?: string | null; token: string }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function ask(qText: string) {
    if (!community || !qText.trim()) return;
    setQuestion(qText);
    setBusy(true);
    setAnswer(null);
    try {
      const res = await fetch(`/api/c/${community}/ask`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, question: qText }),
      });
      const body = await res.json().catch(() => ({}));
      setAnswer(res.ok ? body.answer ?? "(no answer)" : body.error ?? `Error ${res.status}`);
    } catch (e) {
      setAnswer(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`${card} mt-6`}>
      <h2 className="text-lg font-semibold">Ask your community</h2>
      <p className="text-sm text-white/55">Grok answers using read-only tools over your members across all events (the same MCP server any agent can use).</p>
      <form
        className="mt-3 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
      >
        <input className={inputCls} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Who could speak about Postgres next month?" />
        <button disabled={busy || !community} className="rounded-xl bg-emerald-400 px-5 py-3 font-semibold text-black disabled:opacity-50">
          {busy ? "Thinking…" : "Ask"}
        </button>
      </form>
      <div className="mt-2 flex flex-wrap gap-2">
        {EXAMPLES.map((e) => (
          <button key={e} type="button" onClick={() => ask(e)} className="rounded-full border border-white/15 px-3 py-1 text-sm text-white/70 hover:bg-white/10">
            {e}
          </button>
        ))}
      </div>
      {answer && <div className="mt-4 whitespace-pre-wrap rounded-xl bg-black/30 p-4 leading-relaxed">{answer}</div>}
    </section>
  );
}

function ImportBox({ slug, q, onDone }: { slug: string; q: string; onDone: () => void }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/e/${slug}/import?${q}`, { method: "POST", headers: { "content-type": "text/csv" }, body: await f.text() });
      const body = await res.json().catch(() => ({}));
      setMsg(res.ok ? `Imported ${body.imported ?? 0} guests.` : body.error ?? `Error ${res.status}`);
      onDone();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={card}>
      <h2 className="text-lg font-semibold">Import Luma guests</h2>
      <p className="text-sm text-white/55">Upload the guest CSV export. The first free-text registration answer becomes each person&apos;s line.</p>
      <input type="file" accept=".csv,text/csv" disabled={busy} onChange={(e) => onFile(e.target.files?.[0])} className="mt-3 block text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-white" />
      {msg && <p className="mt-2 text-white/80">{msg}</p>}
    </section>
  );
}

function DangerZone({ slug, q }: { slug: string; q: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  async function del() {
    const typed = window.prompt('This permanently deletes every member, intro and contact for this event. Type "delete" to confirm.');
    if (typed !== "delete") return;
    const res = await fetch(`/api/e/${slug}?${q}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    setMsg(res.ok ? "All event data deleted." : body.error ?? `Error ${res.status}`);
  }
  return (
    <section className="mt-6 rounded-2xl border border-red-500/30 p-5">
      <h2 className="text-lg font-semibold text-red-300">Delete all event data</h2>
      <p className="text-sm text-white/55">Removes the event, its members, intros and contacts. Cannot be undone.</p>
      <button onClick={del} className="mt-3 rounded-xl bg-red-500/80 px-4 py-2 font-semibold text-white hover:bg-red-500">Delete everything</button>
      {msg && <p className="mt-2">{msg}</p>}
    </section>
  );
}
