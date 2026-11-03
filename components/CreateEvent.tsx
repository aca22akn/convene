"use client";
import { useState } from "react";
import { inputCls } from "./JoinForm";

type Created = { slug: string; admin_token: string; community_slug: string; community_token: string | null };

export function CreateEvent() {
  const [name, setName] = useState("");
  const [communityName, setCommunityName] = useState("");
  const [communitySlug, setCommunitySlug] = useState("");
  const [communityToken, setCommunityToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          community_name: communityName.trim() || undefined,
          community_slug: communitySlug.trim() || undefined,
          community_token: communityToken.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.slug) throw new Error(body.error ?? `Error ${res.status}`);
      setCreated(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    const origin = window.location.origin;
    const links = [
      ["Stage (put this on the projector)", `${origin}/e/${created.slug}/stage`],
      ["Join link (the QR points here)", `${origin}/e/${created.slug}`],
      ["Organiser dashboard (private: keep this link)", `${origin}/e/${created.slug}/organiser#t=${created.admin_token}`],
      ["Community directory", `${origin}/c/${created.community_slug}`],
    ];
    return (
      <section className="mt-14 rounded-2xl border border-emerald-400/30 bg-emerald-400/5 p-6">
        <h2 className="text-2xl font-semibold">Your event is ready</h2>
        <p className="mt-2 rounded-lg bg-amber-400/10 px-3 py-2 text-amber-200">
          Save the organiser link now. Its token is shown only once and gives access to this event.
        </p>
        {created.community_token && <p className="mt-2 break-all rounded-lg bg-amber-400/10 px-3 py-2 font-mono text-amber-100">Community token (save separately): {created.community_token}</p>}
        <ul className="mt-4 space-y-3">
          {links.map(([label, url]) => (
            <li key={label}>
              <p className="text-sm text-white/60">{label}</p>
              <a className="break-all font-mono text-emerald-200 underline" href={url}>{url}</a>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section className="mt-14 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <h2 className="text-2xl font-semibold">Run it at your next event</h2>
      <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
        <input className={`${inputCls} sm:col-span-2`} required maxLength={80} placeholder="Event name, e.g. Agents Night #12" value={name} onChange={(e) => setName(e.target.value)} />
        <input className={inputCls} maxLength={80} placeholder="Community name (new)" value={communityName} onChange={(e) => setCommunityName(e.target.value)} />
        <input className={inputCls} maxLength={60} placeholder="…or existing community slug" value={communitySlug} onChange={(e) => setCommunitySlug(e.target.value)} autoCapitalize="off" />
        <input className={`${inputCls} sm:col-span-2`} maxLength={128} placeholder="Existing community token (if joining one)" value={communityToken} onChange={(e) => setCommunityToken(e.target.value)} autoCapitalize="off" autoComplete="off" />
        {error && <p className="text-red-300 sm:col-span-2">{error}</p>}
        <button disabled={busy} className="rounded-xl bg-emerald-400 py-3 font-semibold text-black disabled:opacity-60 sm:col-span-2">
          {busy ? "Creating…" : "Create event"}
        </button>
      </form>
    </section>
  );
}
