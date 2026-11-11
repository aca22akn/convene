"use client";
import { useEffect, useRef } from "react";

export function LegacyTokenExchange({ returnTo }: { returnTo: string }) {
  const form = useRef<HTMLFormElement>(null);
  const submitted = useRef(false);
  useEffect(() => {
    if (submitted.current) return;
    const url = new URL(window.location.href);
    const token = url.searchParams.get("token");
    if (!token) return;

    submitted.current = true;
    url.searchParams.delete("token");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    const tokenInput = form.current?.querySelector<HTMLInputElement>('input[name="token"]');
    if (tokenInput) tokenInput.value = token;
    form.current?.requestSubmit();
  }, []);

  return (
    <main id="main" className="mx-auto max-w-xl p-8">
      <p role="status">Securing your organiser session…</p>
      <form ref={form} action="/api/auth/exchange" method="post">
        <input type="hidden" name="token" value="" />
        <input type="hidden" name="return_to" value={returnTo} />
        <button type="submit" className="mt-4 underline">Continue to organiser dashboard</button>
      </form>
    </main>
  );
}
