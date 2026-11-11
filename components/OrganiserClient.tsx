"use client";
import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { mockOrganiser, type LiveIntro, type LiveMember, type OrganiserMember, type OrganiserView } from "@/lib/mocks";
import { useLive } from "@/lib/useLive";
import { firstName, headlineQuote, tagRows, xUrl } from "@/lib/ui";
import { Brand } from "./Brand";
import { Graph } from "./Graph";
import { AlertIcon, DownloadIcon, ExternalIcon, MicIcon, SearchIcon } from "./icons";
import { Callout, CopyButton, Eyebrow, inputCls, Spinner } from "./ui";

const EXAMPLES = [
  "Who could speak about Postgres next month?",
  "What do members need that nobody offers?",
  "Who has come to more than one event and is looking for a cofounder?",
];
const MEMBER_PAGE = 40;

const subscribeToLocation = () => () => {};
const getOrigin = () => window.location.origin;
const getServerOrigin = () => "";

export function OrganiserClient({ slug, mock, aiProviderName = "AI" }: { slug: string; mock: boolean; aiProviderName?: string }) {
  const [manualToken, setManualToken] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [joiningBusy, setJoiningBusy] = useState(false);
  const [joiningError, setJoiningError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);
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

  if (deleted) {
    return (
      <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6">
        <Brand />
        <section role="status" className="card mt-10 p-6">
          <h1 className="text-3xl font-extrabold tracking-tight">Event deleted</h1>
          <p className="mt-2 text-fg-2">Every member, intro and contact for this event has been removed. The join link, stage and this dashboard no longer work.</p>
          <Link href="/" className="btn btn-primary mt-5">Back to Convene</Link>
        </section>
      </main>
    );
  }

  if (!mock && !data) {
    const checking = !authReady || authBusy || (!error && !authError);
    return (
      <main id="main" className="mx-auto w-full max-w-xl flex-1 px-4 py-6 sm:px-6">
        <Brand />
        {checking ? (
          <section role="status" aria-label="Opening the organiser dashboard" className="card mt-10 flex items-center gap-3 p-6">
            <Spinner className="text-gold" />
            <p className="text-lg font-semibold">{authReady ? "Opening your dashboard…" : "Securing your organiser session…"}</p>
          </section>
        ) : (
          <section className="card mt-10 p-6" aria-labelledby="organiser-access">
            <h1 id="organiser-access" className="text-3xl font-extrabold tracking-tight">Organiser access</h1>
            <p className="mt-2 text-fg-2">Open the organiser link you saved when you created the event, or paste an event or community token to start a 12-hour session.</p>
            <form className="mt-5 space-y-3" onSubmit={(e) => { e.preventDefault(); void exchangeToken(manualToken); }}>
              <label htmlFor="organiser-token" className="block font-semibold">Organiser token</label>
              <input id="organiser-token" className={inputCls} autoComplete="off" autoCapitalize="off" value={manualToken} onChange={(e) => setManualToken(e.target.value)} />
              <button disabled={authBusy || !manualToken.trim()} className="btn btn-primary btn-lg w-full">
                {authBusy ? (<><Spinner /> Securing session…</>) : "Continue"}
              </button>
            </form>
            {(authError || error) && (
              <p role="alert" className="mt-4 text-sm font-semibold text-danger">
                {/unauthori[sz]ed|forbidden|40[13]/i.test(authError ?? error ?? "")
                  ? authError ? "That token didn’t work. Check you copied the whole organiser link or token." : "This browser isn’t signed in to this event’s dashboard yet, or your 12-hour session has ended."
                  : authError ?? error}
              </p>
            )}
          </section>
        )}
      </main>
    );
  }

  return <Dashboard slug={slug} mock={mock} data={data} error={error} aiProviderName={aiProviderName}
    joiningBusy={joiningBusy} joiningError={joiningError} authError={authError}
    onToggleJoining={(closed) => void setJoiningClosed(closed)} onLogout={() => void logout()} onRefetch={refetch} onDeleted={() => setDeleted(true)} />;
}

function Dashboard({
  slug, mock, data, error, aiProviderName, joiningBusy, joiningError, authError, onToggleJoining, onLogout, onRefetch, onDeleted,
}: {
  slug: string; mock: boolean; data: OrganiserView | null; error: string | null; aiProviderName: string;
  joiningBusy: boolean; joiningError: string | null; authError: string | null;
  onToggleJoining: (closed: boolean) => void; onLogout: () => void; onRefetch: () => void; onDeleted: () => void;
}) {
  const origin = useSyncExternalStore(subscribeToLocation, getOrigin, getServerOrigin);
  const members = data?.members ?? [];
  const intros = data?.intros ?? [];
  const speakers = data?.speakers ?? [];
  const community = data?.event.community_slug;
  const closed = data?.event.joins_closed === true;
  const optedIn = members.filter((m) => m.contact_consent).length;
  const joinUrl = origin ? `${origin}/e/${slug}` : `/e/${slug}`;
  const stageUrl = `${joinUrl}/stage`;

  return (
    <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 pb-12 pt-2 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <Brand />
        <div className="flex flex-wrap gap-2">
          <a className="btn btn-primary" href={`/e/${slug}/stage`} target="_blank" rel="noreferrer">
            Open stage <ExternalIcon className="h-4 w-4" /><span className="sr-only">(opens in a new tab)</span>
          </a>
          {!mock && <button type="button" onClick={onLogout} className="btn btn-ghost">End organiser session</button>}
        </div>
      </header>

      <div className="mt-6">
        <Eyebrow>Organiser dashboard</Eyebrow>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">{data?.event.name ?? slug}</h1>
      </div>

      {error && data && <Callout tone="warn" className="mt-4">Can’t refresh right now ({error}). Showing the last data we loaded; it updates when the connection is back.</Callout>}
      {authError && <Callout tone="error" className="mt-4">{authError}</Callout>}

      {/* Run the room: the controls an organiser needs during the event, first. */}
      <section aria-labelledby="room-title" className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <h2 id="room-title" className="sr-only">Run the room</h2>
        <div className={`card flex flex-col gap-4 p-5 ${closed ? "border-gold/60" : ""}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className={`flex items-center gap-2 text-xl font-bold ${closed ? "text-gold" : "text-ok"}`}>
                <span className="dot" aria-hidden="true" />
                {closed ? "Joining is closed" : "Joining is open"}
              </p>
              <p className="mt-1 text-fg-2">
                {closed ? "The doors are closed. New attendees cannot join; people already in keep their intros." : "The doors are open. Attendees can join with the link or the QR on the stage."}
              </p>
            </div>
            <div className="flex flex-col items-center gap-1">
              <button
                type="button"
                role="switch"
                aria-label="Close joining"
                aria-checked={closed}
                disabled={joiningBusy || mock}
                onClick={() => onToggleJoining(!closed)}
                className="switch"
              />
              <span aria-hidden="true" className="text-sm font-semibold text-fg-2">Close joining</span>
            </div>
          </div>
          {mock && <p className="text-sm text-fg-3">Sample dashboard: controls are read-only.</p>}
          {joiningBusy && <p role="status" className="flex items-center gap-2 text-sm text-fg-2"><Spinner /> Updating…</p>}
          {joiningError && <Callout tone="error">{joiningError}</Callout>}
        </div>

        <div className="card space-y-4 p-5">
          <LinkLine label="Join link (the QR points here)" url={joinUrl} copyLabel="Copy join link" />
          <LinkLine label="Stage (put this on the projector)" url={stageUrl} copyLabel="Copy stage link" />
          {community && (
            <p className="text-sm text-fg-2">
              Community directory: <a className="font-semibold text-thread underline underline-offset-4" href={`/c/${community}`}>/c/{community}</a>
            </p>
          )}
        </div>
      </section>

      <dl className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Members" value={members.length} />
        <Stat label="Intros" value={intros.length} />
        <Stat label="Speaker candidates" value={speakers.length} />
        <Stat label="Opted-in contacts" value={optedIn} />
      </dl>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <MembersSection members={members} speakerIds={new Set(speakers.map((s) => s.id))} loaded={Boolean(data)} />
          <RoomMap members={members} intros={intros} />
        </div>
        <div className="min-w-0 space-y-6">
          <SpeakersSection speakers={speakers} loaded={Boolean(data)} />
          <NeedsSection data={data} />
        </div>
      </div>

      <AskBox community={community} />

      <section aria-labelledby="data-title" className="mt-6">
        <h2 id="data-title" className="text-xl font-bold">Data</h2>
        <div className="mt-3 grid gap-6 lg:grid-cols-2">
          <div className="card p-5">
            <h3 className="text-lg font-bold">Exports</h3>
            <p className="mt-1 text-fg-2">Contacts include only people who ticked consent. Import the file on your phone, then add them to WhatsApp.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {optedIn > 0 ? (
                <a className="btn btn-primary" href={`/api/e/${slug}/export/contacts.vcf`} download>
                  <DownloadIcon /> Contacts ({optedIn} opted in)
                </a>
              ) : (
                <span className="btn btn-secondary" aria-disabled="true">
                  <DownloadIcon /> Contacts (nobody opted in yet)
                </span>
              )}
              <a className="btn btn-secondary" href={`/api/e/${slug}/export/members.csv`} download><DownloadIcon /> members.csv</a>
              <a className="btn btn-secondary" href={`/api/e/${slug}/export/intros.csv`} download><DownloadIcon /> intros.csv</a>
            </div>
          </div>
          <ImportBox slug={slug} aiEnabled={data?.event.ai_enabled === true} aiProviderName={aiProviderName} onDone={onRefetch} />
        </div>
      </section>

      <DangerZone slug={slug} eventName={data?.event.name ?? slug} disabled={mock} onDeleted={onDeleted} />
    </main>
  );
}

function LinkLine({ label, url, copyLabel }: { label: string; url: string; copyLabel: string }) {
  const id = useId();
  return (
    <div className="@container">
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-fg-2">{label}</label>
      <div className="flex flex-col gap-2 @md:flex-row">
        <input id={id} readOnly value={url} onFocus={(e) => e.currentTarget.select()} className={`${inputCls} min-w-0 flex-1 font-mono text-sm`} />
        <CopyButton text={url} label={copyLabel} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card px-4 py-3">
      <dt className="text-sm font-semibold text-fg-2">{label}</dt>
      <dd className="text-3xl font-extrabold tabular-nums">{value}</dd>
    </div>
  );
}

function MembersSection({ members, speakerIds, loaded }: { members: OrganiserMember[]; speakerIds: Set<string>; loaded: boolean }) {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(MEMBER_PAGE);
  const q = query.trim().toLowerCase();
  const shown = useMemo(() => {
    const newestFirst = [...members].reverse();
    if (!q) return newestFirst;
    return newestFirst.filter((m) =>
      [m.name, m.line, m.x_handle ?? "", m.speak_on ?? "", ...m.offers, ...m.seeks, ...m.topics].some((v) => v.toLowerCase().includes(q)));
  }, [members, q]);

  return (
    <section aria-labelledby="members-title" className="card p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="members-title" className="text-xl font-bold">Members</h2>
        <p className="text-sm text-fg-2" role="status">{q ? `${shown.length} of ${members.length} match` : `${members.length} joined, newest first`}</p>
      </div>
      <label htmlFor="member-search" className="mt-4 block text-sm font-semibold">Search members</label>
      <div className="relative mt-1.5">
        <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-fg-3" />
        <input id="member-search" type="search" className={`${inputCls} pl-11`} placeholder="Name, what they build, a tag…" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(MEMBER_PAGE); }} />
      </div>

      {!loaded ? (
        <div aria-hidden="true" className="mt-4 space-y-3"><div className="skeleton h-14" /><div className="skeleton h-14" /></div>
      ) : members.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-ink-700 p-4 text-fg-2">Nobody has joined yet. Open the stage on the projector or share the join link; people appear here as they join.</p>
      ) : shown.length === 0 ? (
        <p className="mt-4 text-fg-2">No members match “{query.trim()}”.</p>
      ) : (
        <ul aria-label="Members" className="mt-4 divide-y divide-ink-700">
          {shown.slice(0, limit).map((m) => {
            const speaker = speakerIds.has(m.id) || Boolean(m.speak_on);
            return (
              <li key={m.id} className="py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <p className="font-bold">{m.name}</p>
                  {m.x_handle && <a className="text-sm font-semibold text-thread underline underline-offset-2" href={xUrl(m.x_handle)} target="_blank" rel="noreferrer">@{m.x_handle.replace(/^@/, "")}</a>}
                  {speaker && <span className="chip chip-gold"><MicIcon className="h-3.5 w-3.5" /> Speaker candidate</span>}
                  {m.contact_consent && <span className="chip chip-thread">Shared contact</span>}
                </div>
                <p className="mt-1 font-serif text-[1.0625rem] leading-snug text-fg-2">{m.line}</p>
                {m.speak_on && <p className="mt-1 text-sm text-fg-2">Would speak on: <span className="font-serif text-fg">“{m.speak_on}”</span></p>}
              </li>
            );
          })}
        </ul>
      )}
      {shown.length > limit && (
        <button type="button" className="btn btn-secondary mt-3 w-full" onClick={() => setLimit((l) => l + MEMBER_PAGE)}>
          Show {Math.min(MEMBER_PAGE, shown.length - limit)} more of {shown.length - limit}
        </button>
      )}
    </section>
  );
}

function RoomMap({ members, intros }: { members: OrganiserMember[]; intros: OrganiserView["intros"] }) {
  const liveMembers: LiveMember[] = members.map((m) => ({ id: m.id, display_name: firstName(m.name) }));
  const liveIntros: LiveIntro[] = intros.map((i) => ({ a_id: i.a_id, b_id: i.b_id, created_at: i.created_at ?? "", headline: headlineQuote(i.reasons) }));
  return (
    <section aria-labelledby="map-title" className="card p-5">
      <h2 id="map-title" className="text-xl font-bold">Room map</h2>
      <p className="mt-1 text-fg-2">Each line is an intro. People with no line yet may need a hello from you.</p>
      <div className="mt-4 h-80 overflow-hidden rounded-xl border border-ink-700 bg-ink-950">
        <Graph members={liveMembers} intros={liveIntros} />
      </div>
    </section>
  );
}

function SpeakersSection({ speakers, loaded }: { speakers: OrganiserView["speakers"]; loaded: boolean }) {
  return (
    <section aria-labelledby="speakers-title" className="card p-5">
      <h2 id="speakers-title" className="text-xl font-bold">Speaker candidates</h2>
      <p className="mt-1 text-fg-2">People who said they’re happy to speak, ranked by what the room wants to hear.</p>
      <ol className="mt-4 space-y-3">
        {speakers.map((s, i) => (
          <li key={s.id} className="rounded-xl border border-ink-700 bg-ink-800/50 p-3.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-bold"><span className="text-fg-3">{i + 1}.</span> {s.name}</p>
              {s.x_handle && <a className="text-sm font-semibold text-thread underline underline-offset-2" href={xUrl(s.x_handle)} target="_blank" rel="noreferrer">@{s.x_handle.replace(/^@/, "")}</a>}
            </div>
            {s.speak_on && <p className="mt-1 font-serif text-lg leading-snug">“{s.speak_on}”</p>}
            {s.speak_topics.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">{s.speak_topics.map((t) => <span key={t} className="chip">{t}</span>)}</div>
            )}
          </li>
        ))}
        {loaded && speakers.length === 0 && <li className="text-fg-2">No speaker candidates yet. They appear when someone fills in “Happy to speak on”.</li>}
      </ol>
    </section>
  );
}

function NeedsSection({ data }: { data: OrganiserView | null }) {
  const rows = data ? tagRows(data.needs, data.offers).slice(0, 12) : [];
  const max = Math.max(1, ...rows.map((r) => Math.max(r.needs, r.offers)));
  const bar = "h-2 w-full appearance-none overflow-hidden rounded-full [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-ink-700 [&::-moz-progress-bar]:rounded-full";
  return (
    <section aria-labelledby="needs-title" className="card p-5">
      <h2 id="needs-title" className="text-xl font-bold">Needs vs offers</h2>
      <p className="mt-1 flex flex-wrap gap-x-4 text-sm text-fg-2">
        <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-5 rounded-full bg-gold" aria-hidden="true" /> needed</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-5 rounded-full bg-thread" aria-hidden="true" /> offered</span>
      </p>
      <ul className="mt-4 space-y-3">
        {rows.map((r) => (
          <li key={r.tag} className="grid grid-cols-[7rem_minmax(0,1fr)_auto] items-center gap-3 text-sm">
            <span className="truncate font-semibold">{r.tag}</span>
            <span className="space-y-1">
              <progress className={`${bar} [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-gold [&::-moz-progress-bar]:bg-gold`} max={max} value={r.needs} aria-label={`${r.tag}: ${r.needs} need`} />
              <progress className={`${bar} [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-thread [&::-moz-progress-bar]:bg-thread`} max={max} value={r.offers} aria-label={`${r.tag}: ${r.offers} offer`} />
            </span>
            <span className="text-right tabular-nums text-fg-2" aria-hidden="true">{r.needs}/{r.offers}</span>
          </li>
        ))}
        {data && rows.length === 0 && <li className="text-fg-2">No data yet.</li>}
      </ul>
      <h3 className="mt-6 font-bold">Unmet needs</h3>
      <p className="text-sm text-fg-2">Asked for, but nobody in the room offers it. Good topics for the next event or a sponsor ask.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {(data?.unmet ?? []).map((t) => <span key={t} className="chip chip-gold">{t}</span>)}
        {data && data.unmet.length === 0 && <span className="text-fg-2">None.</span>}
      </div>
    </section>
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
    <section aria-labelledby="ask-title" className="card mt-6 p-5">
      <h2 id="ask-title" className="text-xl font-bold">Ask your community</h2>
      <p className="mt-1 text-fg-2">Answers use read-only tools scoped to the access you used: this event for an event token, or all community events for a community token.</p>
      <label htmlFor="community-question" className="mt-4 block text-sm font-semibold">Question</label>
      <form className="mt-1.5 flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); void ask(question); }}>
        <input id="community-question" className={inputCls} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Who could speak about Postgres next month?" />
        <button disabled={busy || !community} className="btn btn-primary sm:w-32">{busy ? (<><Spinner /> Asking</>) : "Ask"}</button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {EXAMPLES.map((e) => (
          <button key={e} type="button" disabled={busy || !community} onClick={() => void ask(e)} className="btn btn-secondary min-h-11 rounded-full px-4 text-sm font-semibold">{e}</button>
        ))}
      </div>
      <div aria-live="polite">
        {answer && <div className="mt-4 whitespace-pre-wrap rounded-xl border border-ink-700 bg-ink-950 p-4 leading-relaxed">{answer}</div>}
      </div>
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
    <div className="card p-5">
      <h3 className="text-lg font-bold">Import Luma guests</h3>
      <p className="mt-1 text-fg-2">Upload the guest CSV export. The first free-text registration answer becomes each person&apos;s line.</p>
      {aiEnabled && (
        <label className="check-row mt-3 text-fg-2">
          <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
          <span>I confirm attendees were told their answers are analysed by {aiProviderName}.</span>
        </label>
      )}
      <label htmlFor="luma-csv" className="mt-3 block text-sm font-semibold">Luma CSV export</label>
      <input
        id="luma-csv" type="file" accept=".csv,text/csv" disabled={busy} onChange={(e) => void onFile(e.target.files?.[0])}
        className="mt-1.5 block w-full text-sm text-fg-2 file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-xl file:border file:border-line-strong file:bg-ink-800 file:px-4 file:font-semibold file:text-fg"
      />
      {busy && <p role="status" className="mt-2 flex items-center gap-2 text-fg-2"><Spinner /> Importing…</p>}
      {msg && <p role="status" className="mt-2 text-fg">{msg}</p>}
    </div>
  );
}

const CONFIRM_WORD = "delete";

function DangerZone({ slug, eventName, disabled, onDeleted }: { slug: string; eventName: string; disabled: boolean; onDeleted: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const titleId = useId();

  function open() {
    setTyped("");
    setMsg(null);
    const el = dialog.current;
    if (!el) return;
    if (typeof el.showModal === "function") el.showModal();
    else el.setAttribute("open", "");
  }
  function close() {
    const el = dialog.current;
    if (!el) return;
    if (typeof el.close === "function") el.close();
    else el.removeAttribute("open");
  }

  async function del(e: React.FormEvent) {
    e.preventDefault();
    if (typed.trim().toLowerCase() !== CONFIRM_WORD) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/e/${slug}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Error ${res.status}`);
      close();
      onDeleted();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="danger-title" className="mt-10 rounded-2xl border border-danger/40 p-5">
      <h2 id="danger-title" className="flex items-center gap-2 text-xl font-bold text-danger"><AlertIcon /> Delete all event data</h2>
      <p className="mt-1 text-fg-2">Removes the event, its members, intros and contacts. This cannot be undone.</p>
      <button type="button" onClick={open} disabled={disabled} className="btn btn-danger mt-4">Delete everything…</button>
      {disabled && <p className="mt-2 text-sm text-fg-3">Sample dashboard: nothing can be deleted here.</p>}

      <dialog ref={dialog} aria-labelledby={titleId} className="m-auto w-[min(32rem,calc(100%-2rem))] rounded-2xl border border-ink-700 bg-ink-900 p-0 text-fg backdrop:bg-black/70">
        <form onSubmit={del} className="p-6">
          <h2 id={titleId} className="text-2xl font-extrabold tracking-tight">Delete “{eventName}”?</h2>
          <p className="mt-2 text-fg-2">This permanently deletes every member, intro and contact for this event. The join link, stage and dashboard stop working. It cannot be undone.</p>
          <label htmlFor="confirm-delete" className="mt-5 block font-semibold">Type “{CONFIRM_WORD}” to confirm</label>
          <input id="confirm-delete" className={`${inputCls} mt-1.5`} autoComplete="off" autoCapitalize="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
          {msg && <p role="alert" className="mt-3 text-sm font-semibold text-danger">{msg}</p>}
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="btn btn-secondary" onClick={close}>Cancel</button>
            <button className="btn btn-danger" disabled={busy || typed.trim().toLowerCase() !== CONFIRM_WORD}>
              {busy ? (<><Spinner /> Deleting…</>) : "Delete everything"}
            </button>
          </div>
        </form>
      </dialog>
    </section>
  );
}
