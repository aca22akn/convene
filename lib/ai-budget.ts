import { admin } from "./db";
import { envLimit } from "./ratelimit";

function utcDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

async function claim(key: string, limit: number): Promise<boolean> {
  const { data, error } = await admin().rpc("rate_limit_hit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: 86_400,
  });
  if (error || typeof data !== "boolean") throw error ?? new Error("invalid AI budget response");
  return data;
}

/** Reserve one xAI call against both the global and per-scope daily budgets. */
export async function aiCallAllowed(scopeId: string): Promise<boolean> {
  const day = utcDay();
  try {
    const scopeAllowed = await claim(
      `ai:event:${scopeId}:${day}`,
      envLimit("AI_EVENT_DAILY_CALL_LIMIT", 400),
    );
    const globalAllowed = scopeAllowed && await claim(`ai:day:${day}`, envLimit("AI_DAILY_CALL_LIMIT", 3000));
    if (globalAllowed) return true;
    const logged = await claim(`ai:budget-log:${day}`, 1).catch(() => false);
    if (logged) console.warn(`[ai-budget] xAI budget exhausted for ${day}; using keyword and tag-only fallback`);
    return false;
  } catch (error) {
    console.error("[ai-budget] Could not reserve xAI budget; using fallback", error);
    return false;
  }
}
