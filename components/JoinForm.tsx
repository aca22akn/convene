"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Brand } from "./Brand";
import { ArrowLeftIcon, ArrowRightIcon, WifiOffIcon } from "./icons";
import { Callout, inputCls, PrivacyNotice, Spinner, useOnline } from "./ui";
import { privacyNotice, RETENTION_DAYS_DEFAULT } from "@/lib/privacy";

export { inputCls };

const STEPS = ["Your line", "A little more", "Your choices"] as const;
const LAST = STEPS.length - 1;
const HANDLE = /^@?[A-Za-z0-9_]{1,15}$/;

/** Turns the join route's responses into something an attendee can act on. */
function joinErrorMessage(status: number, error: unknown): string {
  if (error === "room_full") return "This room is full. Ask the organiser if they can make space.";
  if (error === "doors are closed") return "The doors are closed. This event is no longer accepting new attendees.";
  if (status === 429) return "Lots of people are joining from this network right now. Wait a minute and try again; what you wrote is still here.";
  if (status === 404) return "We couldn’t find this event. Check the link with the organiser.";
  if (typeof error === "string" && error.startsWith("invalid input")) {
    return /x_handle/.test(error) ? "Check your X handle: letters, numbers and underscores, up to 15." : "Check your name and your line, then try again.";
  }
  if (status >= 500) return "Something went wrong on our side. Try again in a moment; what you wrote is still here.";
  return typeof error === "string" && error ? error : `Something went wrong (${status}). Try again.`;
}

export function JoinForm({
  slug,
  eventName,
  aiEnabled = false,
  joiningClosed = false,
  notFound = false,
  retentionDays = RETENTION_DAYS_DEFAULT,
  aiProviderName = "AI",
}: {
  slug: string;
  eventName?: string;
  aiEnabled?: boolean;
  joiningClosed?: boolean;
  notFound?: boolean;
  retentionDays?: number;
  aiProviderName?: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<"fwd" | "back">("fwd");
  const [name, setName] = useState("");
  const [line, setLine] = useState("");
  const [xHandle, setXHandle] = useState("");
  const [speakOn, setSpeakOn] = useState("");
  const [consent, setConsent] = useState(false);
  const [contact, setContact] = useState("");
  const [directoryConsent, setDirectoryConsent] = useState(false);
  const [aiOptOut, setAiOptOut] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [attempted, setAttempted] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stepHeading = useRef<HTMLHeadingElement>(null);
  const stepChanged = useRef(false);

  const online = useOnline();
  const subscribeToStoredMember = useCallback((onStoreChange: () => void) => {
    window.addEventListener("storage", onStoreChange);
    return () => window.removeEventListener("storage", onStoreChange);
  }, []);
  const getStoredMember = useCallback(() => {
    try {
      return localStorage.getItem(`convene:${slug}`) ?? "";
    } catch {
      return "";
    }
  }, [slug]);
  const storedMember = useSyncExternalStore(subscribeToStoredMember, getStoredMember, () => null);
  const existing = storedMember || null;

  // Move focus to the new step's heading so screen readers announce it and the thumb stays put.
  useEffect(() => {
    if (!stepChanged.current) return;
    stepHeading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [step]);

  // Instant validation: always computed, shown once a field is touched or its step was attempted.
  const trimmedLine = line.trim();
  const handle = xHandle.trim();
  const errors: Record<string, string | null> = {
    name: name.trim() ? null : "Enter your name.",
    line: trimmedLine.length >= 3 ? null : "Write at least a few words so we can find the right people.",
    handle: !handle || HANDLE.test(handle) ? null : "Use letters, numbers and underscores, up to 15 characters.",
    contact: consent && !contact.trim() ? "Add a phone number or email, or untick this." : null,
  };
  const fieldsByStep: string[][] = [["name", "line"], ["handle"], ["contact"]];
  const show = (field: string) => (touched[field] || attempted[fieldsByStep.findIndex((f) => f.includes(field))]) && errors[field];
  const touch = (field: string) => () => setTouched((t) => ({ ...t, [field]: true }));
  const idOf = (field: string) => `join-${field}`;

  function goTo(next: number) {
    stepChanged.current = true;
    setDirection(next > step ? "fwd" : "back");
    setStep(next);
  }

  function advance() {
    const blocking = fieldsByStep[step].filter((f) => errors[f]);
    if (blocking.length) {
      setAttempted((a) => ({ ...a, [step]: true }));
      document.getElementById(idOf(blocking[0]))?.focus();
      return;
    }
    goTo(step + 1);
  }

  async function submit() {
    const blocking = fieldsByStep[step].filter((f) => errors[f]);
    if (blocking.length) {
      setAttempted((a) => ({ ...a, [step]: true }));
      document.getElementById(idOf(blocking[0]))?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/e/${slug}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          line: trimmedLine,
          x_handle: handle || null,
          speak_on: speakOn.trim() || null,
          contact: consent ? contact.trim() || null : null,
          contact_consent: consent && !!contact.trim(),
          directory_consent: directoryConsent,
          ai_opt_out: aiOptOut,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.member_id) throw new Error(joinErrorMessage(res.status, body.error));
      try {
        localStorage.setItem(`convene:${slug}`, body.member_id);
      } catch {}
      router.push(`/e/${slug}/me?id=${body.member_id}&joined=1`);
    } catch (err) {
      setError(
        err instanceof TypeError
          ? "Couldn’t reach Convene. Check your connection and try again; what you wrote is still here."
          : err instanceof Error ? err.message : "Something went wrong",
      );
      setBusy(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (step < LAST) advance();
    else void submit();
  }

  const label = "mb-1.5 block font-semibold";
  const hint = "mt-1.5 text-sm text-fg-2";
  const err = "mt-1.5 text-sm font-semibold text-danger";

  return (
    <main id="main" className="mx-auto w-full max-w-lg flex-1 px-4 pb-6 pt-2">
      <Brand small />
      <h1 className="mt-4 text-[2rem] font-extrabold leading-[1.1] tracking-tight">Who should you meet here?</h1>
      {eventName && <p className="mt-2 text-fg-2">You’re joining <span className="font-semibold text-fg">{eventName}</span>.</p>}

      {existing && !joiningClosed && !notFound && (
        <a href={`/e/${slug}/me?id=${existing}`} className="btn btn-secondary mt-4 w-full justify-between">
          You already joined. See your intros <ArrowRightIcon />
        </a>
      )}

      {notFound ? (
        <section role="status" className="card mt-6 p-5">
          <h2 className="text-xl font-bold">We couldn’t find this event</h2>
          <p className="mt-2 text-fg-2">The link may be mistyped or the event may have been deleted. Ask the organiser for the join link, or scan the QR code on the stage again.</p>
        </section>
      ) : joiningClosed ? (
        <section role="status" className="mt-6 rounded-2xl border border-gold/50 bg-gold/10 p-5">
          <h2 className="text-xl font-bold">The doors are closed</h2>
          <p className="mt-2 text-fg-2">This event is no longer accepting new attendees. If you joined earlier, open your intros from the same phone. Otherwise ask the organiser.</p>
          {existing && <a href={`/e/${slug}/me?id=${existing}`} className="btn btn-primary mt-4">See your intros</a>}
        </section>
      ) : (
        <form onSubmit={onSubmit} noValidate className="mt-5">
          <div className="flex items-baseline justify-between text-sm font-semibold">
            <span className="text-fg-2">Step {step + 1} of {STEPS.length}</span>
            <span className="text-fg-3">{step === LAST ? "Almost there" : "About 30 seconds"}</span>
          </div>
          <div className="mt-2 flex gap-1.5" aria-hidden="true">
            {STEPS.map((s, i) => (
              <span key={s} className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${i <= step ? "bg-gold" : "bg-ink-700"}`} />
            ))}
          </div>

          {!online && (
            <Callout tone="warn" className="mt-4">
              <p className="flex items-center gap-2 font-semibold"><WifiOffIcon className="h-4 w-4" /> You’re offline</p>
              <p className="text-fg-2">What you’ve written is kept on this page. Reconnect, then continue.</p>
            </Callout>
          )}

          <div key={step} className={`mt-5 ${direction === "fwd" ? "step-fwd" : "step-back"}`}>
            <h2 ref={stepHeading} tabIndex={-1} className="text-2xl font-bold tracking-tight outline-none">{STEPS[step]}</h2>

            {step === 0 && (
              <div className="mt-4 space-y-5">
                <div>
                  <label htmlFor={idOf("name")} className={label}>Name</label>
                  <input
                    id={idOf("name")} className={inputCls} maxLength={80} value={name} autoComplete="name" enterKeyHint="next"
                    onChange={(e) => setName(e.target.value)} onBlur={touch("name")}
                    aria-invalid={Boolean(show("name"))} aria-describedby={show("name") ? "join-name-error" : undefined}
                  />
                  {show("name") && <p id="join-name-error" className={err}>{errors.name}</p>}
                </div>
                <div>
                  <label htmlFor={idOf("line")} className={label}>One line: what are you building, and what do you need?</label>
                  <textarea
                    id={idOf("line")} className={`${inputCls} field-voice min-h-32`} maxLength={280} value={line}
                    onChange={(e) => setLine(e.target.value)} onBlur={touch("line")}
                    placeholder="Building an NHS triage assistant, need a clinical safety officer"
                    aria-invalid={Boolean(show("line"))} aria-describedby={`join-line-help${show("line") ? " join-line-error" : ""}`}
                  />
                  <div className="flex items-start justify-between gap-4">
                    <p id="join-line-help" className={hint}>Write it like you’d say it to a stranger. Your intros quote your words.</p>
                    <p className={`${hint} tabular-nums`} aria-hidden="true">{line.length}/280</p>
                  </div>
                  {show("line") && <p id="join-line-error" className={err}>{errors.line}</p>}
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="mt-4 space-y-5">
                <p className="text-fg-2">Both optional. Skip straight to the next step if you like.</p>
                <div>
                  <label htmlFor={idOf("handle")} className={label}>X handle <span className="font-normal text-fg-2">(optional)</span></label>
                  <input
                    id={idOf("handle")} className={inputCls} maxLength={16} value={xHandle} placeholder="@handle" autoCapitalize="off" autoCorrect="off" autoComplete="off"
                    onChange={(e) => setXHandle(e.target.value)} onBlur={touch("handle")}
                    aria-invalid={Boolean(show("handle"))} aria-describedby={`join-handle-help${show("handle") ? " join-handle-error" : ""}`}
                  />
                  <p id="join-handle-help" className={hint}>Shown on your intros so people can find you.</p>
                  {show("handle") && <p id="join-handle-error" className={err}>{errors.handle}</p>}
                </div>
                <div>
                  <label htmlFor={idOf("speak")} className={label}>Happy to speak on <span className="font-normal text-fg-2">(optional)</span></label>
                  <input
                    id={idOf("speak")} className={`${inputCls} field-voice`} maxLength={160} value={speakOn} placeholder="Scaling Postgres without Kubernetes"
                    onChange={(e) => setSpeakOn(e.target.value)} aria-describedby="join-speak-help"
                  />
                  <p id="join-speak-help" className={hint}>The organiser sees you as a speaker candidate for this topic.</p>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="mt-4 space-y-4">
                <fieldset className="card-raised p-4">
                  <legend className="sr-only">Contact sharing</legend>
                  <p className="text-lg font-bold">Share your contact with the organiser?</p>
                  <p className="mt-1 text-fg-2">Only the organiser receives it, and only if you tick this. They use it to add you to the community WhatsApp.</p>
                  <label className="check-row mt-3">
                    <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                    <span>Share my contact with the organiser so they can add me to the community WhatsApp</span>
                  </label>
                  {consent && (
                    <div className="step-fwd mt-3">
                      <label htmlFor={idOf("contact")} className={label}>Phone or email</label>
                      <input
                        id={idOf("contact")} className={inputCls} maxLength={120} value={contact} autoComplete="email" inputMode="email"
                        onChange={(e) => setContact(e.target.value)} onBlur={touch("contact")}
                        aria-invalid={Boolean(show("contact"))} aria-describedby={show("contact") ? "join-contact-error" : undefined}
                      />
                      {show("contact") && <p id="join-contact-error" className={err}>{errors.contact}</p>}
                    </div>
                  )}
                </fieldset>

                <div className="card-raised p-4">
                  <label className="check-row">
                    <input type="checkbox" checked={directoryConsent} onChange={(e) => setDirectoryConsent(e.target.checked)} />
                    <span className="text-lg font-bold">Show me in the community directory</span>
                  </label>
                  <p className="mt-1 pl-[2.375rem] text-fg-2">If you opt in, the public directory shows your name, X handle, event line, talk topic, and the number of events where you opted in. Contact sharing is separate.</p>
                </div>

                {aiEnabled && (
                  <div className="card-raised p-4">
                    <p className="text-lg font-bold">AI matching</p>
                    <p className="mt-1 text-fg-2">Your name, line, X handle and talk topic may be processed by {aiProviderName} to find your intros.</p>
                    <label className="check-row mt-3">
                      <input type="checkbox" checked={aiOptOut} onChange={(e) => setAiOptOut(e.target.checked)} />
                      <span>Keep my text away from external AI; I&apos;ll get basic matching only</span>
                    </label>
                  </div>
                )}

                <details className="group rounded-xl border border-ink-700">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 py-2 font-semibold">
                    How your data is used
                    <span aria-hidden="true" className="text-fg-3 transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <PrivacyNotice items={privacyNotice(aiEnabled, retentionDays, aiProviderName)} className="px-4 pb-4 pl-9 text-sm text-fg-2" />
                </details>
              </div>
            )}
          </div>

          <div className="sticky bottom-0 z-10 -mx-4 mt-8 border-t border-ink-700 bg-ink-950 px-4 shadow-[0_-12px_24px_-12px_rgb(0_0_0/0.8)] pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
            {error && <Callout tone="error" className="mb-3">{error}</Callout>}
            <div className="flex gap-3">
              {step > 0 && (
                <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => goTo(step - 1)}>
                  <ArrowLeftIcon /> Back
                </button>
              )}
              <button className="btn btn-primary btn-lg flex-1" disabled={busy} aria-busy={busy}>
                {step < LAST ? (<>Next <ArrowRightIcon /></>) : busy ? (<><Spinner /> Finding your intros…</>) : "Find my intros"}
              </button>
            </div>
          </div>
        </form>
      )}
    </main>
  );
}
