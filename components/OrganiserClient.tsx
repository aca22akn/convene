"use client";
import { useCallback, useEffect, useState } from "react";
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

export function OrganiserClient({ slug, mock, aiProviderName = "xAI" }: { slug: string; mock: boolean; aiProviderName?: string }) {
  const [manualToken, setManualToken] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [joiningBusy, setJoiningBusy] = useState(false);
  const [joiningError, setJoiningError] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(() => {
    if (typeof window === "undefined") return true;
    return !new URLSearchParams(window.location.hash.slice(1)).has("t");
  });
  const { data, error, refetch } = useLive<OrganiserView>(authReady || mock ? `/api/e/${slug}/organiser` : null, {
    mock: mock ? mockOrganiser : undefined,
    intervalMs: 5000,
  });

  const exchangeToken = useCallback(async (token: string) => {
    if (!token.trim()) return;
    setAuthBusy(true);
    setAuthError(null);
    try {
      const response = await fetch("/api/auth/exchange", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? `Error ${response.status}`);
      setManualToken("");
      setAuthReady(true);
      await refetch();
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : "Could not start organiser session");
    } finally {
      setAuthBusy(false);
    }
  }, [refetch]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const fragmentToken = params.get("t");
    if (!fragmentToken) return;
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    const timer = window.setTimeout(() => { void exchangeToken(fragmentToken); }, 0);
    return () => window.clearTimeout(timer);
  }, [exchangeToken]);

  async function logout() {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (!response.ok) setAuthError("Could not end the organiser session");
    else window.location.reload();
  }

  async function setJoiningClosed(joins_closed: boolean) {
    setJoiningBusy(true);
    setJoiningError(null);
    try {
      const response = await fetch(`/api/e/${slug}/organiser`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ joins_closed }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? `Error ${response.status}`);
      await refetch();
    } catch (e) {
      setJoiningError(e instanceof Error ? e.message : "Could not update joining status");
    } finally {
      setJoiningBusy(false);
    }
  }

  if (!mock && !data) {
    return (
      <main id="main" className="mx-auto max-w-2xl p-8">
        <Brand />
        <h1 className="mt-8 text-xl">Organiser access</h1>
        <p className="mt-2 text-white/70">Open your saved organiser link or paste an event or community token to start a 12-hour session.</p>
        <form className="mt-4 flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void exchangeToken(manualToken); }}>
          <label htmlFor="organiser-token">Organiser token</label>
          <input id="organiser-token" className={inputCls} autoComplete="off" value={manualToken} onChange={(e) => setManualToken(e.target.value)} />
          <button disabled={authBusy || !manualToken.trim()} className="rounded-xl bg-emerald-400 px-4 py-3 font-semibold text-black disabled:opacity-50">
            {authBusy ? "Securing session…" : "Continue"}
          </button>
        </form>
        {(authError || (error && !data)) && <p role="alert" className="mt-3 text-red-300">{authError ?? error}</p>}
      </main>
    );
  }

  const rows = data ? tagRows(data.needs, data.offers) : [];
  const max = Math.max(1, ...rows.map((r) => Math.max(r.needs, r.offers)));
  const community = data?.event.community_slug;

  return (
    <main id="main" className="mx-auto w-full max-w-6xl p-5 lg:p-8">
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

      {!mock && data && (
        <section className={`${card} mt-6 flex flex-wrap items-center justify-between gap-4`}>
          <div>
            <h2 className="font-semibold">Attendee joining</h2>
            <p className="mt-1 text-sm text-white/60">{data.event.joins_closed ? "The doors are closed. New attendees cannot join." : "The doors are open. Attendees can join this event."}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-label="Close joining"
            aria-checked={data.event.joins_closed === true}
            disabled={joiningBusy}
            onClick={() => void setJoiningClosed(data.event.joins_closed !== true)}
            className={`relative h-8 w-14 rounded-full transition-colors disabled:opacity-50 ${data.event.joins_closed ? "bg-amber-400" : "bg-white/20"}`}
          >
            <span aria-hidden="true" className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-transform ${data.event.joins_closed ? "translate-x-7" : "translate-x-1"}`} />
          </button>
        </section>
      )}
      {joiningError && <p role="alert" className="mt-3 rounded-lg bg-red-500/15 px-4 py-2 text-red-200">{joiningError}</p>}

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Members" value={data?.members.length ?? 0} />
        <Stat label="Intros" value={data?.intros.length ?? 0} />
        <Stat label="Speakers" value={data?.speakers.length ?? 0} />
        <Stat label="Shared contact" value={data?.members.filter((m) => m.contact_consent).length ?? 0} />
      </div>

      <div className="mt-6 flex justify-end"><button type="button" onClick={() => void logout()} className={btn}>End organiser session</button></div>
      <AskBox community={community} />

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
                  <progress
                    className="h-2.5 w-full appearance-none overflow-hidden rounded-full bg-white/10 [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-rose-400 [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-white/10 [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-rose-400"
                    max={max}
                    value={r.needs}
                    aria-label={`${r.needs} need`}
                  />
                  <progress
                    className="h-2.5 w-full appearance-none overflow-hidden rounded-full bg-white/10 [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-emerald-400 [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-white/10 [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-emerald-400"
                    max={max}
                    value={r.offers}
                    aria-label={`${r.offers} offer`}
                  />
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
              <a key={f} className={btn} href={`/api/e/${slug}/export/${f}`}>⬇ {f}</a>
            ))}
          </div>
        </section>
        <ImportBox slug={slug} aiEnabled={data?.event.ai_enabled === true} aiProviderName={aiProviderName} onDone={refetch} />
      </div>

      <DangerZone slug={slug} />
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

function AskBox({ community }: { community?: string | null }) {
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
        body: JSON.stringify({ question: qText }),
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
      <p className="text-sm text-white/55">Grok answers with read-only tools scoped to the access you used: this event for an event token, or all community events for a community token.</p>
      <label htmlFor="community-question" className="mt-3 block text-sm font-medium text-white/80">Question</label>
      <form
        className="mt-1 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
      >
        <input id="community-question" className={inputCls} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Who could speak about Postgres next month?" />
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

function ImportBox({ slug, aiEnabled, aiProviderName, onDone }: { slug: string; aiEnabled: boolean; aiProviderName: string; onDone: () => void }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  async function onFile(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/e/${slug}/import`, {
        method: "POST",
        headers: { "content-type": "text/csv", "x-ai-processing-acknowledged": acknowledged ? "true" : "false" },
        body: await f.text(),
      });
      const body = await res.json().catch(() => ({}));
      setMsg(res.ok ? `Imported ${body.imported ?? 0} guests${body.ai_used ? ` using ${aiProviderName}` : " with keyword matching"}.` : body.error ?? `Error ${res.status}`);
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
      {aiEnabled && (
        <label className="mt-3 flex items-start gap-3 text-sm text-white/75">
          <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
          <span>I confirm attendees were told their answers are analysed by {aiProviderName}.</span>
        </label>
      )}
      <label htmlFor="luma-csv" className="mt-3 block text-sm font-medium text-white/80">Luma CSV export</label>
      <input id="luma-csv" type="file" accept=".csv,text/csv" disabled={busy} onChange={(e) => onFile(e.target.files?.[0])} className="mt-1 block text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-white" />
      {msg && <p className="mt-2 text-white/80">{msg}</p>}
    </section>
  );
}

function DangerZone({ slug }: { slug: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  async function del() {
    const typed = window.prompt('This permanently deletes every member, intro and contact for this event. Type "delete" to confirm.');
    if (typed !== "delete") return;
    const res = await fetch(`/api/e/${slug}`, { method: "DELETE" });
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
