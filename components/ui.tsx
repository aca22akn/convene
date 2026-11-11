"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AlertIcon, CheckIcon, CopyIcon, InfoIcon } from "./icons";

/** Shared class for every text input, textarea and select. */
export const inputCls = "field";

const subscribeOnline = (onChange: () => void) => {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
};

/** `navigator.onLine`, live. Treated as online on the server and during hydration. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

type CopyState = "idle" | "copied" | "failed";

/** Copies `text` and says so, in the button and in a polite live region. Falls back to "select the link" when the clipboard is blocked. */
export function CopyButton({ text, label = "Copy link", className = "btn btn-secondary" }: { text: string; label?: string; className?: string }) {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    let next: CopyState = "copied";
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      next = "failed";
    }
    setState(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2400);
  }

  return (
    <>
      <button type="button" onClick={() => void copy()} disabled={!text} className={`${className} min-w-[10.5rem]`}>
        {state === "copied" ? <CheckIcon /> : <CopyIcon />}
        {state === "copied" ? "Copied" : state === "failed" ? "Select and copy" : label}
      </button>
      <span role="status" className="sr-only">
        {state === "copied" ? "Copied to clipboard" : state === "failed" ? "Copy failed. Select the text and copy it manually." : ""}
      </span>
    </>
  );
}

const TONES = {
  error: { cls: "border-danger/50 bg-danger/10 text-fg", icon: <AlertIcon className="mt-0.5 h-5 w-5 text-danger" />, role: "alert" as const },
  warn: { cls: "border-gold/50 bg-gold/10 text-fg", icon: <AlertIcon className="mt-0.5 h-5 w-5 text-gold" />, role: "status" as const },
  info: { cls: "border-ink-700 bg-ink-800 text-fg-2", icon: <InfoIcon className="mt-0.5 h-5 w-5 text-thread" />, role: "status" as const },
  ok: { cls: "border-ok/40 bg-ok/10 text-fg", icon: <CheckIcon className="mt-0.5 h-5 w-5 text-ok" />, role: "status" as const },
};

/** A message with an icon and a role, so state is never colour-only and screen readers hear it. */
export function Callout({ tone = "info", role, children, className = "" }: { tone?: keyof typeof TONES; role?: "alert" | "status" | "none"; children: React.ReactNode; className?: string }) {
  const t = TONES[tone];
  const resolved = role ?? t.role;
  return (
    <div role={resolved === "none" ? undefined : resolved} className={`flex gap-3 rounded-xl border px-4 py-3 ${t.cls} ${className}`}>
      {t.icon}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`spinner ${className}`} />;
}

/** Renders `lib/privacy.ts` sentences verbatim; backticked config keys become <code>. */
export function PrivacyNotice({ items, className = "" }: { items: string[]; className?: string }) {
  return (
    <ul aria-label="Privacy notice" className={`list-disc space-y-2 pl-5 marker:text-fg-3 ${className}`}>
      {items.map((item) => (
        <li key={item}>
          {item.split("`").map((part, i) =>
            i % 2 === 1 ? <code key={i} className="rounded bg-ink-800 px-1 py-0.5 font-mono text-[0.85em] text-fg-2">{part}</code> : part,
          )}
        </li>
      ))}
    </ul>
  );
}

/** Quiet section label used above groups of controls. */
export function Eyebrow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={`text-sm font-bold uppercase tracking-[0.14em] text-fg-3 ${className}`}>{children}</p>;
}
