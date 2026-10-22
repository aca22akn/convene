"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Brand } from "./Brand";

export const inputCls =
  "w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-lg text-white placeholder:text-white/35 focus:border-emerald-400 focus:outline-none";

export function JoinForm({ slug }: { slug: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [line, setLine] = useState("");
  const [xHandle, setXHandle] = useState("");
  const [speakOn, setSpeakOn] = useState("");
  const [consent, setConsent] = useState(false);
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<string | null>(null);

  useEffect(() => {
    try {
      setExisting(localStorage.getItem(`convene:${slug}`));
    } catch {}
  }, [slug]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/e/${slug}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          line,
          x_handle: xHandle.trim() || null,
          speak_on: speakOn.trim() || null,
          contact: consent ? contact.trim() || null : null,
          contact_consent: consent && !!contact.trim(),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.member_id) throw new Error(body.error ?? `Something went wrong (${res.status})`);
      try {
        localStorage.setItem(`convene:${slug}`, body.member_id);
      } catch {}
      router.push(`/e/${slug}/me?id=${body.member_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-lg px-5 py-8">
      <Brand small />
      <h1 className="mt-6 text-3xl font-bold leading-tight">Who should you meet tonight?</h1>
      <p className="mt-2 text-white/60">30 seconds. Then you&apos;ll see up to 2 people in the room, and why.</p>

      {existing && (
        <a
          href={`/e/${slug}/me?id=${existing}`}
          className="mt-4 block rounded-xl border border-emerald-400/40 bg-emerald-400/10 px-4 py-3 text-emerald-200"
        >
          You already joined. See your matches →
        </a>
      )}

      <form onSubmit={submit} className="mt-6 space-y-5">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-white/80">Name</span>
          <input className={inputCls} required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-white/80">One line: what are you building, and what do you need?</span>
          <textarea
            className={`${inputCls} min-h-24`}
            required
            minLength={3}
            maxLength={280}
            value={line}
            onChange={(e) => setLine(e.target.value)}
            placeholder="Building an NHS triage assistant, need a clinical safety officer"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-white/80">
            X handle <span className="text-white/40">(optional)</span>
          </span>
          <input className={inputCls} maxLength={40} value={xHandle} onChange={(e) => setXHandle(e.target.value)} placeholder="@handle" autoCapitalize="off" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-white/80">
            Happy to speak on <span className="text-white/40">(optional)</span>
          </span>
          <input className={inputCls} maxLength={160} value={speakOn} onChange={(e) => setSpeakOn(e.target.value)} placeholder="Scaling Postgres without Kubernetes" />
        </label>
        <div className="rounded-xl border border-white/10 p-4">
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-1 h-5 w-5 accent-emerald-400" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span className="text-white/80">Share my contact with the organiser so they can add me to the community WhatsApp</span>
          </label>
          <input
            className={`${inputCls} mt-3 disabled:opacity-40`}
            disabled={!consent}
            maxLength={120}
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="Phone or email"
          />
        </div>
        {error && <p className="rounded-lg bg-red-500/15 px-4 py-2 text-red-200">{error}</p>}
        <button disabled={busy} className="w-full rounded-xl bg-emerald-400 py-4 text-lg font-semibold text-black disabled:opacity-60">
          {busy ? "Joining…" : "Find my people"}
        </button>
        <p className="text-center text-sm text-white/45">Nothing is sent to anyone. The organiser can delete all event data.</p>
      </form>
    </main>
  );
}
