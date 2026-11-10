"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { browser } from "./db";

/**
 * Fetch `url`, poll as a fallback, and refetch on server-sent Supabase broadcasts for `eventId`.
 * With `mock` set, returns the mock and never fetches.
 */
export function useLive<T>(url: string | null, opts: { eventId?: string | null; mock?: T; intervalMs?: number } = {}) {
  const { eventId, mock, intervalMs = 10_000 } = opts;
  const [data, setData] = useState<T | null>(mock ?? null);
  const [error, setError] = useState<string | null>(null);
  const [subscribedEventId, setSubscribedEventId] = useState<string | null>(null);
  const etag = useRef<string | null>(null);
  const etagUrl = useRef(url);
  const resolvedEventId = eventId ?? (data as { event?: { id?: string } } | null)?.event?.id ?? null;
  const isSubscribed = !mock && resolvedEventId !== null && subscribedEventId === resolvedEventId;

  const refetch = useCallback(async () => {
    if (!url || mock) return;
    try {
      if (etagUrl.current !== url) {
        etagUrl.current = url;
        etag.current = null;
      }
      const headers = etag.current ? { "If-None-Match": etag.current } : undefined;
      const res = await fetch(url, { cache: "no-store", ...(headers ? { headers } : {}) });
      if (res.status === 304) {
        const nextEtag = res.headers.get("ETag");
        if (nextEtag) etag.current = nextEtag;
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error ?? `HTTP ${res.status}`);
        return;
      }
      etag.current = res.headers.get("ETag");
      const nextData = (await res.json()) as T;
      setData((current) => (JSON.stringify(current) === JSON.stringify(nextData) ? current : nextData));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    }
  }, [mock, url]);

  useEffect(() => {
    if (!url || mock) return;
    const initialFetch = setTimeout(() => {
      if (!document.hidden) void refetch();
    }, 0);
    return () => clearTimeout(initialFetch);
  }, [url, mock, refetch]);

  useEffect(() => {
    if (!url || mock || isSubscribed) return;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    // The upper bound stays at intervalMs, so a dropped channel resumes within 10 seconds by default.
    const delay = () => Math.round(intervalMs * (0.9 + Math.random() * 0.1));
    const schedule = (ms: number) => {
      if (disposed || document.hidden || isSubscribed) return;
      pollTimer = setTimeout(async () => {
        pollTimer = undefined;
        if (disposed || document.hidden || isSubscribed) return;
        await refetch();
        schedule(delay());
      }, ms);
    };
    schedule(delay());
    const onVisibilityChange = () => {
      if (document.hidden) {
        if (pollTimer) clearTimeout(pollTimer);
        pollTimer = undefined;
      } else if (!isSubscribed) {
        if (pollTimer) clearTimeout(pollTimer);
        void refetch();
        schedule(delay());
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      disposed = true;
      if (pollTimer) clearTimeout(pollTimer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [url, mock, intervalMs, isSubscribed, refetch]);

  useEffect(() => {
    if (!resolvedEventId || mock) return;
    const sb = browser();
    if (!sb) return;
    let active = true;
    const ch = sb
      .channel(`event:${resolvedEventId}`, { config: { private: true, broadcast: { self: false } } })
      .on("broadcast", { event: "changed" }, () => void refetch())
      .subscribe((status) => {
        if (active) setSubscribedEventId(status === "SUBSCRIBED" ? resolvedEventId : null);
      });
    return () => {
      active = false;
      void sb.removeChannel(ch);
    };
  }, [resolvedEventId, mock, refetch]);

  return { data, error, refetch };
}
