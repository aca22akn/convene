import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { admin } from "./db";

export const SESSION_COOKIE = "__Host-convene_session";
export const SESSION_TTL_SECONDS = 12 * 60 * 60;
export const LLM_TOKEN_TTL_SECONDS = 10 * 60;

export type AuthScope =
  | { type: "event"; eventId: string; communityId: string | null }
  | { type: "community"; communityId: string };

export type AuthIdentity = {
  scope: AuthScope;
  kind: "admin" | "session" | "llm";
  via: "bearer" | "cookie";
  llm: boolean;
};

type EventForScope = { id: string; community_id: string | null };

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Compare fixed-length SHA-256 digests without leaking a byte-by-byte comparison. */
export function tokenHashMatches(token: string, storedHash: string | null | undefined): boolean {
  if (!storedHash || !/^[a-f0-9]{64}$/i.test(storedHash)) return false;
  const actual = Buffer.from(hashToken(token), "hex");
  const expected = Buffer.from(storedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function tokenExpired(expiresAt: string, now = Date.now()): boolean {
  const expires = Date.parse(expiresAt);
  return !Number.isFinite(expires) || expires <= now;
}

export function scopeAllowsEvent(scope: AuthScope, event: EventForScope): boolean {
  return scope.type === "event"
    ? scope.eventId === event.id
    : scope.communityId === event.community_id;
}

export function eventFilterForAuth(auth: AuthIdentity): { eventIds?: string[] } {
  return auth.scope.type === "event" ? { eventIds: [auth.scope.eventId] } : {};
}

export function makeSessionCookie(token: string, maxAge = SESSION_TTL_SECONDS): string {
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

export function validReturnPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\r\n]/.test(value)) return null;
  try {
    const parsed = new URL(value, "https://convene.invalid");
    if (parsed.origin !== "https://convene.invalid") return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

export function originMatches(req: Request): boolean {
  const originValue = req.headers.get("origin");
  if (!originValue) return false;
  try {
    const origin = new URL(originValue);
    const requestUrl = new URL(req.url);
    const host = req.headers.get("host") ?? requestUrl.host;
    return origin.origin === `${requestUrl.protocol}//${host}`;
  } catch {
    return false;
  }
}

function cookieValue(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    return part.slice(separator + 1).trim() || null;
  }
  return null;
}

function bearerValue(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim() || null;
}

async function resolveToken(token: string, via: AuthIdentity["via"], allowLlm: boolean): Promise<AuthIdentity | null> {
  const digest = hashToken(token);
  const db = admin();
  const [eventResult, communityResult] = await Promise.all([
    db.from("events").select("id,community_id,admin_token_hash").eq("admin_token_hash", digest).maybeSingle(),
    db.from("communities").select("id,admin_token_hash").eq("admin_token_hash", digest).maybeSingle(),
  ]);

  if (eventResult.error) throw eventResult.error;
  if (communityResult.error) throw communityResult.error;

  const event = eventResult.data as { id: string; community_id: string | null; admin_token_hash: string | null } | null;
  if (event && tokenHashMatches(token, event.admin_token_hash)) {
    return { scope: { type: "event", eventId: event.id, communityId: event.community_id }, kind: "admin", via, llm: false };
  }

  const community = communityResult.data as { id: string; admin_token_hash: string | null } | null;
  if (community && tokenHashMatches(token, community.admin_token_hash)) {
    return { scope: { type: "community", communityId: community.id }, kind: "admin", via, llm: false };
  }

  const { data: stored, error } = await db
    .from("access_tokens")
    .select("token_hash,token_type,event_id,community_id,llm,expires_at")
    .eq("token_hash", digest)
    .maybeSingle();
  if (error) throw error;
  if (!stored || !tokenHashMatches(token, stored.token_hash) || tokenExpired(stored.expires_at)) return null;
  if (stored.llm && !allowLlm) return null;
  if (stored.event_id) {
    const { data: scopedEvent, error: scopedEventError } = await db
      .from("events")
      .select("id,community_id")
      .eq("id", stored.event_id)
      .maybeSingle();
    if (scopedEventError) throw scopedEventError;
    if (!scopedEvent) return null;
    return {
      scope: { type: "event", eventId: scopedEvent.id, communityId: scopedEvent.community_id },
      kind: stored.llm ? "llm" : "session",
      via,
      llm: stored.llm,
    };
  }
  if (stored.community_id) {
    const { data: scopedCommunity, error: scopedCommunityError } = await db
      .from("communities")
      .select("id")
      .eq("id", stored.community_id)
      .maybeSingle();
    if (scopedCommunityError) throw scopedCommunityError;
    if (!scopedCommunity) return null;
    return {
      scope: { type: "community", communityId: scopedCommunity.id },
      kind: stored.llm ? "llm" : "session",
      via,
      llm: stored.llm,
    };
  }
  return null;
}

export async function resolveRequestAuth(req: Request, options: { allowLlm?: boolean } = {}): Promise<AuthIdentity | null> {
  const bearer = bearerValue(req);
  if (bearer) return resolveToken(bearer, "bearer", options.allowLlm ?? false);
  const session = cookieValue(req, SESSION_COOKIE);
  if (!session) return null;
  return resolveToken(session, "cookie", options.allowLlm ?? false);
}

export async function resolveAdminToken(token: string | null | undefined): Promise<AuthIdentity | null> {
  if (!token) return null;
  const resolved = await resolveToken(token, "bearer", false);
  return resolved?.kind === "admin" ? resolved : null;
}

export async function authorizeEventRequest(
  req: Request,
  event: EventForScope,
  options: { stateChanging?: boolean } = {},
): Promise<{ auth: AuthIdentity | null; status: 401 | 403 | 200 }> {
  const auth = await resolveRequestAuth(req);
  if (!auth || auth.llm || !scopeAllowsEvent(auth.scope, event)) return { auth: null, status: 401 };
  if (options.stateChanging && auth.via === "cookie" && !originMatches(req)) return { auth: null, status: 403 };
  return { auth, status: 200 };
}

export async function storeAccessToken(scope: AuthScope, kind: "session" | "llm", ttlSeconds: number): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const { error } = await admin().from("access_tokens").insert({
    token_hash: hashToken(token),
    token_type: kind,
    event_id: scope.type === "event" ? scope.eventId : null,
    community_id: scope.type === "community" ? scope.communityId : null,
    llm: kind === "llm",
    expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
  });
  if (error) throw error;
  return token;
}

export async function revokeSession(req: Request): Promise<void> {
  const token = cookieValue(req, SESSION_COOKIE);
  if (!token) return;
  const { error } = await admin()
    .from("access_tokens")
    .delete()
    .eq("token_hash", hashToken(token))
    .eq("token_type", "session");
  if (error) throw error;
}

export async function communityTokenMatches(communityId: string, token: string | null | undefined): Promise<boolean> {
  if (!token) return false;
  const { data, error } = await admin()
    .from("communities")
    .select("admin_token_hash")
    .eq("id", communityId)
    .maybeSingle();
  if (error) throw error;
  return !!data && tokenHashMatches(token, data.admin_token_hash);
}
