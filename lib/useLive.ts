"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { browser } from "./db";

/**
 * Fetch `url`, poll every 3s, and refetch on any Supabase realtime change to members/intros of `eventId`.
 * With `mock` set, returns the mock and never fetches.
 */
export function useLive<T>(url: string | null, opts: { eventId?: string | null; mock?: T; intervalMs?: number } = {}) {
  const { eventId, mock, intervalMs = 3000 } = opts;
  const [data, setData] = useState<T | null>(mock ?? null);
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef(url);
  urlRef.current = url;

  const refetch = useCallback(async () => {
    const u = urlRef.current;
    if (!u || mock) return;
    try {
      const res = await fetch(u, { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error ?? `HTTP ${res.status}`);
        return;
      }
      setData((await res.json()) as T);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    }
  }, [mock]);

  useEffect(() => {
    if (!url || mock) return;
    refetch();
    const t = setInterval(refetch, intervalMs);
    return () => clearInterval(t);
  }, [url, mock, intervalMs, refetch]);

  useEffect(() => {
    if (!eventId || mock) return;
    const sb = browser();
    if (!sb) return;
    const ch = sb
      .channel(`live-${eventId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "members", filter: `event_id=eq.${eventId}` }, () => refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "intros", filter: `event_id=eq.${eventId}` }, () => refetch())
      .subscribe();
    return () => {
      sb.removeChannel(ch);
    };
  }, [eventId, mock, refetch]);

  return { data, error, refetch };
}
