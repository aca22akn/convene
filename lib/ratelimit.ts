import { isIP } from "node:net";
import { admin } from "./db";

type LimitOptions = { limit: number; windowSeconds: number; extraKey?: string };

/** Retry at the next fixed-window boundary, rounded up to whole seconds. */
export function retryAfterSeconds(windowSeconds: number, now = Date.now()): number {
  const seconds = Math.max(1, Math.floor(windowSeconds));
  return Math.max(1, Math.ceil((seconds - ((now / 1000) % seconds))));
}

function trustedIp(req: Request): string | null {
  // Vercel sets this header at its edge. X-Forwarded-For can be supplied by the caller.
  const value = req.headers.get("x-vercel-forwarded-for")?.trim();
  return value && isIP(value) ? value : null;
}

/** Returns null when allowed; otherwise a response ready to send from the route. */
export async function limit(req: Request, bucket: string, options: LimitOptions): Promise<Response | null> {
  const ip = trustedIp(req);
  const identity = options.extraKey ?? ip ?? "unknown";
  const max = options.extraKey ? options.limit : ip ? options.limit : Math.min(options.limit, 2);
  const key = `${bucket}:${identity}`;
  try {
    const { data, error } = await admin().rpc("rate_limit_hit", {
      p_key: key,
      p_limit: max,
      p_window_seconds: options.windowSeconds,
    });
    if (error || typeof data !== "boolean") throw error ?? new Error("invalid rate limit response");
    if (data) return null;
    return Response.json({ error: "rate_limited" }, {
      status: 429,
      headers: { "Retry-After": String(retryAfterSeconds(options.windowSeconds)), "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[ratelimit] Postgres limiter unavailable", error);
    return Response.json({ error: "rate_limit_unavailable" }, {
      status: 503,
      headers: { "Retry-After": "60", "Cache-Control": "no-store" },
    });
  }
}

export function envLimit(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}
