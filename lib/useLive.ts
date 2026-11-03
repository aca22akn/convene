"use client";
import { useCallback, useEffect, useState } from "react";
import { browser } from "./db";

/**
 * Fetch `url`, poll as a fallback, and refetch on server-sent Supabase broadcasts for `eventId`.
 * With `mock` set, returns the mock and never fetches.
 */
export function useLive<T>(url: string | null, opts: { eventId?: string | null; mock?: T; intervalMs?: number } = {}) {
  const { eventId, mock, intervalMs = 3000 } = opts;
  const [data, setData] = useState<T | null>(mock ?? null);
  const [error, setError] = useState<string | null>(null);
  const resolvedEventId = eventId ?? (data as { event?: { id?: string } } | null)?.event?.id ?? null;

  const refetch = useCallback(async () => {
    if (!url || mock) return;
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error ?? `HTTP ${res.status}`);
        return;
      }
      const nextData = (await res.json()) as T;
      setData((current) => (JSON.stringify(current) === JSON.stringify(nextData) ? current : nextData));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    }
  }, [mock, url]);

  useEffect(() => {
    if (!url || mock) return;
    const initialFetch = setTimeout(() => void refetch(), 0);
    const t = setInterval(() => void refetch(), intervalMs);
    return () => {
      clearTimeout(initialFetch);
      clearInterval(t);
    };
  }, [url, mock, intervalMs, refetch]);

  useEffect(() => {
    if (!resolvedEventId || mock) return;
    const sb = browser();
    if (!sb) return;
    const ch = sb
      .channel(`event:${resolvedEventId}`, { config: { private: true, broadcast: { self: false } } })
      .on("broadcast", { event: "changed" }, () => void refetch())
      .subscribe();
    return () => {
      void sb.removeChannel(ch);
    };
  }, [resolvedEventId, mock, refetch]);

  return { data, error, refetch };
}
