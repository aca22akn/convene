"use client";
import { useEffect, useId, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { ArrowRightIcon, ChevronDownIcon, ExternalIcon } from "./icons";
import { Callout, CopyButton, inputCls, Spinner } from "./ui";

type Created = { slug: string; admin_token: string; community_slug: string; community_token: string | null };

const NAME_MIN = 2;

function friendlyError(status: number, message: unknown): { text: string; openOptions: boolean } {
  if (status === 429) return { text: "Too many events have been created from this connection. Wait a little and try again.", openOptions: false };
  if (typeof message === "string" && message.startsWith("community exists")) {
    return { text: "That community already exists. Paste its organiser token under Community options, or leave the community fields empty.", openOptions: true };
  }
  if (message === "invalid input") return { text: "Check the event name (2 to 80 characters) and the community fields.", openOptions: false };
  return { text: typeof message === "string" && message ? message : `Something went wrong (${status}). Try again.`, openOptions: false };
}

export function CreateEvent({ aiAvailable = false, aiProviderName = "AI" }: { aiAvailable?: boolean; aiProviderName?: string }) {
  const [name, setName] = useState("");
  const [communityName, setCommunityName] = useState("");
  const [communitySlug, setCommunitySlug] = useState("");
  const [communityToken, setCommunityToken] = useState("");
  const [aiEnabled, setAiEnabled] = useState(aiAvailable);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const optionsId = useId();
  const nameErrorId = useId();

  const trimmed = name.trim();
  const nameError = trimmed.length < NAME_MIN ? (trimmed.length === 0 ? "Give your event a name so guests recognise it." : "Use at least 2 characters.") : null;
  const showNameError = touched && nameError !== null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (nameError) {
      document.getElementById("event-name")?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          community_name: communityName.trim() || undefined,
          community_slug: communitySlug.trim() || undefined,
          community_token: communityToken.trim() || undefined,
          ai_enabled: aiEnabled,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.slug) {
        const friendly = friendlyError(res.status, body.error);
        if (friendly.openOptions) setOptionsOpen(true);
        throw new Error(friendly.text);
      }
      setCreated(body);
    } catch (err) {
      setError(err instanceof TypeError ? "Couldn’t reach Convene. Check your connection and try again; what you typed is still here." : err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (created) return <NextSteps created={created} eventName={trimmed} />;

  return (
    <section className="card p-5 sm:p-6" aria-labelledby="create-title">
      <h2 id="create-title" className="text-2xl font-extrabold tracking-tight">Create your event</h2>
      <p className="mt-1 text-fg-2">One name is enough to start. Everything else can wait.</p>
      <form onSubmit={submit} noValidate className="mt-5 space-y-4">
        <div>
          <label htmlFor="event-name" className="mb-1.5 block font-semibold">Event name</label>
          <input
            id="event-name"
            className={inputCls}
            required
            maxLength={80}
            placeholder="Event name, e.g. Agents Night #12"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name && setTouched(true)}
            aria-invalid={showNameError}
            aria-describedby={showNameError ? nameErrorId : undefined}
            autoComplete="off"
            enterKeyHint="go"
          />
          {showNameError && <p id={nameErrorId} className="mt-1.5 text-sm font-medium text-danger">{nameError}</p>}
        </div>

        <label className="check-row rounded-xl border border-ink-700 bg-ink-800/60 p-3.5">
          <input type="checkbox" checked={aiEnabled} disabled={!aiAvailable} onChange={(e) => setAiEnabled(e.target.checked)} />
          <span className="text-fg-2">
            <span className="font-semibold text-fg">Use {aiProviderName} for matching and Ask (attendees can opt out)</span>
            {!aiAvailable && <span className="mt-0.5 block text-sm"> — unavailable until AI_API_KEY or XAI_API_KEY is configured</span>}
          </span>
        </label>

        <div>
          <button
            type="button"
            className="btn btn-ghost -ml-3 w-fit"
            aria-expanded={optionsOpen}
            aria-controls={optionsId}
            onClick={() => setOptionsOpen((open) => !open)}
          >
            Community options
            <ChevronDownIcon className={`h-4 w-4 transition-transform ${optionsOpen ? "rotate-180" : ""}`} />
          </button>
          {optionsOpen && (
            <div id={optionsId} className="step-fwd mt-2 space-y-4 rounded-xl border border-ink-700 p-4">
              <p className="text-sm text-fg-2">
                Events in one community share a directory and an organiser token. Leave this empty and Convene makes a community from your event name.
              </p>
              <div>
                <label htmlFor="community-name" className="mb-1.5 block text-sm font-semibold">New community name</label>
                <input id="community-name" className={inputCls} maxLength={80} value={communityName} onChange={(e) => setCommunityName(e.target.value)} autoComplete="off" />
              </div>
              <p className="text-sm font-semibold text-fg-3">Or add this event to a community you already run</p>
              <div>
                <label htmlFor="community-slug" className="mb-1.5 block text-sm font-semibold">Existing community slug</label>
                <input id="community-slug" className={inputCls} maxLength={40} value={communitySlug} onChange={(e) => setCommunitySlug(e.target.value)} autoCapitalize="off" autoComplete="off" />
              </div>
              <div>
                <label htmlFor="community-token" className="mb-1.5 block text-sm font-semibold">Existing community token</label>
                <input id="community-token" className={inputCls} maxLength={128} value={communityToken} onChange={(e) => setCommunityToken(e.target.value)} autoCapitalize="off" autoComplete="off" />
              </div>
            </div>
          )}
        </div>

        {error && <Callout tone="error">{error}</Callout>}

        <button disabled={busy} className="btn btn-primary btn-lg w-full" aria-busy={busy}>
          {busy ? (<><Spinner /> Creating…</>) : (<>Create event <ArrowRightIcon /></>)}
        </button>
      </form>
    </section>
  );
}

function LinkRow({ label, url, copyLabel }: { label: string; url: string; copyLabel: string }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-fg-2">{label}</label>
      <div className="flex flex-col gap-2 @lg:flex-row">
        <input id={id} readOnly value={url} onFocus={(e) => e.currentTarget.select()} className={`${inputCls} min-w-0 flex-1 font-mono text-sm`} />
        <CopyButton text={url} label={copyLabel} className="btn btn-secondary w-full @lg:w-auto" />
      </div>
    </div>
  );
}

/** The screen after creation: three numbered steps, in the order an organiser needs them. */
function NextSteps({ created, eventName }: { created: Created; eventName: string }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    // Bring the card into view only when it is not already near the top (a phone, after the hero).
    const top = section.current?.getBoundingClientRect().top ?? 0;
    if (top < 0 || top > window.innerHeight * 0.4) section.current?.scrollIntoView?.({ block: "start" });
  }, []);

  // Only rendered after a click, so reading window here cannot cause a hydration mismatch.
  const base = `${window.location.origin}/e/${created.slug}`;
  const joinUrl = base;
  const stageUrl = `${base}/stage`;
  const organiserUrl = `${base}/organiser#t=${created.admin_token}`;
  const num = "flex h-9 w-9 flex-none items-center justify-center rounded-full bg-gold font-extrabold text-on-gold";

  return (
    <section ref={section} data-created className="card arrive @container scroll-mt-3 p-5 sm:p-6" aria-labelledby="ready-title">
      <h2 id="ready-title" ref={heading} tabIndex={-1} className="text-2xl font-extrabold tracking-tight outline-none">Your event is ready</h2>
      <p className="mt-1 text-fg-2">{eventName ? `${eventName}: ` : ""}three things to do, in this order.</p>

      <ol className="mt-6 space-y-7">
        <li className="flex gap-4">
          <span className={num} aria-hidden="true">1</span>
          <div className="min-w-0 flex-1 space-y-3">
            <h3 className="text-lg font-bold">Save your organiser link</h3>
            <Callout tone="warn">This link is shown once and gives full access to the event. Copy it somewhere safe before you leave this page.</Callout>
            <LinkRow label="Organiser link (private)" url={organiserUrl} copyLabel="Copy organiser link" />
            {created.community_token && (
              <LinkRow label="Community token (save separately: it opens every event in this community)" url={created.community_token} copyLabel="Copy token" />
            )}
          </div>
        </li>
        <li className="flex gap-4">
          <span className={num} aria-hidden="true">2</span>
          <div className="min-w-0 flex-1 space-y-3">
            <h3 className="text-lg font-bold">Put the stage on the projector</h3>
            <p className="text-fg-2">It shows the QR code, who has arrived and each new intro. Open it on the screen guests can see, then press F11 for full screen.</p>
            <a href={stageUrl} target="_blank" rel="noreferrer" className="btn btn-primary btn-lg w-full sm:w-auto">
              Open stage <ExternalIcon /><span className="sr-only">(opens in a new tab)</span>
            </a>
          </div>
        </li>
        <li className="flex gap-4">
          <span className={num} aria-hidden="true">3</span>
          <div className="min-w-0 flex-1 space-y-3">
            <h3 className="text-lg font-bold">Share the join link</h3>
            <p className="text-fg-2">Guests scan the QR on the stage, or you can send them this link and QR.</p>
            <div className="w-fit rounded-2xl bg-white p-3">
              <QRCodeSVG value={joinUrl} size={140} level="M" aria-label={`QR code to join ${eventName || "this event"}`} role="img" />
            </div>
            <LinkRow label="Join link" url={joinUrl} copyLabel="Copy join link" />
          </div>
        </li>
      </ol>

      <div className="mt-7 flex flex-wrap items-center gap-3 border-t border-ink-700 pt-5">
        <a href={organiserUrl} className="btn btn-secondary">Open organiser dashboard</a>
        <a href={`/c/${created.community_slug}`} className="btn btn-ghost">Community directory</a>
      </div>
    </section>
  );
}
