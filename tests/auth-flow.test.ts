import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashToken } from "@/lib/auth";
import { POST as exchange } from "@/app/api/auth/exchange/route";
import { POST as createEvent } from "@/app/api/events/route";
import { POST as ask } from "@/app/api/c/[slug]/ask/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { authorizeEventRequest, SESSION_COOKIE } from "@/lib/auth";

const fakeDb = vi.hoisted(() => ({
  tables: { events: [] as Record<string, unknown>[], communities: [] as Record<string, unknown>[], access_tokens: [] as Record<string, unknown>[] },
  lastLlmAuthorization: null as string | null,
  calls: 0,
  mcpScopes: [] as { eventIds?: string[] }[],
  blockedRateBucket: null as string | null,
}));

vi.mock("@/lib/db", () => ({
  admin: () => ({
    rpc: async (_name: string, args: { p_key: string }) => ({ data: !fakeDb.blockedRateBucket || !args.p_key.startsWith(fakeDb.blockedRateBucket), error: null }),
    from(table: keyof typeof fakeDb.tables) {
      let mode: "select" | "insert" | "delete" = "select";
      let payload: Record<string, unknown> | null = null;
      const filters: [string, unknown, "eq" | "in"][] = [];
      const execute = () => {
        const rows = fakeDb.tables[table];
        if (mode === "insert") {
          if (payload) {
            const inserted = { ...payload };
            if (table === "events" && !inserted.id) inserted.id = `created-event-${rows.length + 1}`;
            if (table === "communities" && !inserted.id) inserted.id = `created-community-${rows.length + 1}`;
            rows.push(inserted);
            return { data: inserted, error: null };
          }
          return { data: null, error: null };
        }
        const matches = (row: Record<string, unknown>) => filters.every(([key, value, operator]) =>
          operator === "eq" ? row[key] === value : Array.isArray(value) && value.includes(row[key]),
        );
        const found = rows.filter(matches);
        if (mode === "delete") {
          fakeDb.tables[table] = rows.filter((row) => !matches(row));
          return { data: null, error: null };
        }
        return { data: found, error: null };
      };
      const query = {
        select() { return query; },
        eq(key: string, value: unknown) { filters.push([key, value, "eq"]); return query; },
        in(key: string, value: unknown) { filters.push([key, value, "in"]); return query; },
        insert(value: Record<string, unknown>) { mode = "insert"; payload = value; return query; },
        delete() { mode = "delete"; return query; },
        async maybeSingle() {
          const result = execute();
          return { data: Array.isArray(result.data) ? result.data[0] ?? null : result.data, error: result.error };
        },
        async single() {
          const result = execute();
          return { data: Array.isArray(result.data) ? result.data[0] ?? null : result.data, error: result.error };
        },
        then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
          return Promise.resolve(execute()).then(resolve, reject);
        },
      };
      return query;
    },
  }),
}));

vi.mock("@/lib/grok", () => ({
  GROK_MODEL: "test-model",
  grok: () => ({
    responses: {
      create: async (args: { tools: { authorization: string }[] }) => {
        fakeDb.calls += 1;
        fakeDb.lastLlmAuthorization = args.tools[0]?.authorization ?? null;
        return { output_text: "Scoped answer" };
      },
    },
    chat: { completions: { create: async () => ({ choices: [{ message: { content: "Fallback answer" } }] }) } },
  }),
}));

vi.mock("@/lib/mcpTools", () => ({
  loadAskContext: async (_communityId: string, _query: string, scope: { eventIds?: string[]; aiEnabledOnly?: boolean; excludeAiOptOut?: boolean }) => {
    fakeDb.mcpScopes.push(scope);
    return { search_members: [], find_speakers: [], community_gaps: { members: 0, gaps: [] } };
  },
}));

const eventToken = "event-admin-token";
const communityToken = "community-admin-token";
const sessionToken = "active-session-token";
const community = { id: "c1", slug: "northstar", name: "Northstar", admin_token_hash: hashToken(communityToken) };
// Existing rows retain their legacy value during the expand phase while the hash is used for auth.
const event = { id: "e1", community_id: "c1", name: "Northstar night", ai_enabled: true, admin_token: eventToken, admin_token_hash: hashToken(eventToken) };

function resetDatabase() {
  fakeDb.tables.events = [{ ...event }];
  fakeDb.tables.communities = [{ ...community }];
  fakeDb.tables.access_tokens = [];
  fakeDb.lastLlmAuthorization = null;
  fakeDb.calls = 0;
  fakeDb.mcpScopes = [];
  fakeDb.blockedRateBucket = null;
}

beforeEach(() => {
  resetDatabase();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("token scope and sessions", () => {
  it("does not let an event token authorize another event or inherit community scope", async () => {
    const req = new Request("https://convene.example/api/e/other", { headers: { authorization: `Bearer ${eventToken}` } });
    const result = await authorizeEventRequest(req, { id: "e2", community_id: "c1" });
    expect(result.status).toBe(401);
  });

  it("allows a community token across its events and bearer writes without Origin", async () => {
    const req = new Request("https://convene.example/api/e/other", { method: "DELETE", headers: { authorization: `Bearer ${communityToken}` } });
    const result = await authorizeEventRequest(req, { id: "e2", community_id: "c1" }, { stateChanging: true });
    expect(result.status).toBe(200);
  });

  it("rejects expired sessions and blocks cookie-authenticated writes with a foreign Origin", async () => {
    fakeDb.tables.access_tokens.push({
      token_hash: hashToken("expired-session"), token_type: "session", event_id: "e1", community_id: null,
      llm: false, expires_at: "2020-01-01T00:00:00.000Z",
    });
    const expired = await authorizeEventRequest(new Request("https://convene.example/api/e/northstar", {
      headers: { cookie: `${SESSION_COOKIE}=expired-session` },
    }), event);
    expect(expired.status).toBe(401);

    fakeDb.tables.access_tokens.push({
      token_hash: hashToken(sessionToken), token_type: "session", event_id: "e1", community_id: null,
      llm: false, expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    const foreignOrigin = await authorizeEventRequest(new Request("https://convene.example/api/e/northstar", {
      method: "DELETE", headers: { cookie: `${SESSION_COOKIE}=${sessionToken}`, origin: "https://attacker.example" },
    }), event, { stateChanging: true });
    expect(foreignOrigin.status).toBe(403);
  });

  it("exchanges a legacy token into a session cookie without returning the token", async () => {
    const response = await exchange(new Request("https://convene.example/api/auth/exchange", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://convene.example" },
      body: JSON.stringify({ token: eventToken }),
    }));
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie");
    expect(cookie).toMatch(/^__Host-convene_session=[A-Za-z0-9_-]+; Path=\/; Max-Age=43200; HttpOnly; Secure; SameSite=Strict$/);
    const responseText = await response.clone().text();
    expect(await response.json()).toEqual({ authenticated: true });
    expect(responseText).not.toContain(eventToken);
    expect(fakeDb.tables.access_tokens).toHaveLength(1);
    expect(fakeDb.tables.access_tokens[0]).toMatchObject({ token_type: "session", event_id: "e1", community_id: null, llm: false });
    const issuedSession = cookie?.match(/__Host-convene_session=([^;]+)/)?.[1];
    expect(issuedSession).toBeTruthy();
    expect(fakeDb.tables.access_tokens[0].token_hash).toBe(hashToken(issuedSession ?? ""));
  });

  it("rate-limits token exchanges with Retry-After", async () => {
    fakeDb.blockedRateBucket = "auth-exchange-ip:";
    const response = await exchange(new Request("https://convene.example/api/auth/exchange", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://convene.example" },
      body: JSON.stringify({ token: eventToken }),
    }));
    expect(response.status).toBe(429);
    expect(response.headers.has("retry-after")).toBe(true);
    expect(fakeDb.tables.access_tokens).toHaveLength(0);
  });

  it("rate-limits logout requests with Retry-After", async () => {
    fakeDb.blockedRateBucket = "auth-exchange-ip:";
    const response = await logout(new Request("https://convene.example/api/auth/logout", { method: "POST" }));
    expect(response.status).toBe(429);
    expect(response.headers.has("retry-after")).toBe(true);
  });

  it("supports legacy organiser links with a clean 303 and logs out by deleting the session", async () => {
    const form = new URLSearchParams({ token: eventToken, return_to: "/e/northstar/organiser" });
    const exchanged = await exchange(new Request("https://convene.example/api/auth/exchange", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://convene.example" },
      body: form,
    }));
    expect(exchanged.status).toBe(303);
    expect(exchanged.headers.get("location")).toBe("/e/northstar/organiser");
    const cookie = exchanged.headers.get("set-cookie")?.split(";")[0];
    const session = cookie?.slice(cookie.indexOf("=") + 1);
    expect(session).toBeTruthy();
    expect(fakeDb.tables.access_tokens.some((row) => row.token_hash === hashToken(session!))).toBe(true);
    const loggedOut = await logout(new Request("https://convene.example/api/auth/logout", {
      method: "POST",
      headers: { cookie: `${SESSION_COOKIE}=${session}`, origin: "https://convene.example" },
    }));
    expect(loggedOut.status).toBe(204);
    expect(loggedOut.headers.get("set-cookie")).toBe(`${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`);
    expect(fakeDb.tables.access_tokens.some((row) => row.token_hash === hashToken(session!))).toBe(false);
  });

  it("rejects cross-origin legacy form exchanges before creating a session", async () => {
    const form = new URLSearchParams({ token: eventToken, return_to: "/e/northstar/organiser" });
    const response = await exchange(new Request("https://convene.example/api/auth/exchange", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: "https://attacker.example",
      },
      body: form,
    }));

    expect(response.status).toBe(403);
    expect(fakeDb.tables.access_tokens).toHaveLength(0);
  });

  it("rejects cross-origin JSON exchanges before creating a session", async () => {
    const response = await exchange(new Request("https://convene.example/api/auth/exchange", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://attacker.example" },
      body: JSON.stringify({ token: eventToken }),
    }));

    expect(response.status).toBe(403);
    expect(fakeDb.tables.access_tokens).toHaveLength(0);
  });

  it("returns new tokens once while storing only hashes, and rejects an event token as a community token", async () => {
    vi.stubEnv("XAI_API_KEY", "");
    const createdResponse = await createEvent(new Request("https://convene.example/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Fresh event", community_name: "Fresh community" }),
    }));
    expect(createdResponse.status).toBe(200);
    const created = await createdResponse.json();
    expect(created.admin_token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(created.community_token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(created)).not.toContain("token=");
    expect(fakeDb.tables.events.at(-1)?.admin_token_hash).toBe(hashToken(created.admin_token));
    expect(fakeDb.tables.events.at(-1)?.ai_enabled).toBe(false);
    expect(fakeDb.tables.communities.at(-1)?.admin_token_hash).toBe(hashToken(created.community_token));
    expect(fakeDb.tables.events.at(-1)?.admin_token).toBeUndefined();
    expect(fakeDb.tables.communities.at(-1)?.admin_token).toBeUndefined();

    const denied = await createEvent(new Request("https://convene.example/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Another event", community_slug: "northstar", community_token: eventToken }),
    }));
    expect(denied.status).toBe(403);

    vi.stubEnv("XAI_API_KEY", "test-key-is-not-used");
    const enabledResponse = await createEvent(new Request("https://convene.example/api/events", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Enabled event", community_slug: "northstar", community_token: communityToken, ai_enabled: true }),
    }));
    expect(enabledResponse.status).toBe(200);
    expect(fakeDb.tables.events.at(-1)?.ai_enabled).toBe(true);
  });

  it("sends only a short-lived, scope-bound LLM token to xAI", async () => {
    fakeDb.tables.access_tokens.push({
      token_hash: hashToken(sessionToken), token_type: "session", event_id: null, community_id: "c1",
      llm: false, expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "https://convene.example");
    const response = await ask(new Request("https://convene.example/api/c/northstar/ask", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `${SESSION_COOKIE}=${sessionToken}`,
        origin: "https://convene.example",
      },
      body: JSON.stringify({ question: "Who knows databases?" }),
    }), { params: Promise.resolve({ slug: "northstar" }) });

    expect(response.status).toBe(200);
    expect(fakeDb.calls).toBe(1);
    expect(fakeDb.lastLlmAuthorization).not.toBe(communityToken);
    expect(fakeDb.lastLlmAuthorization).not.toBe(sessionToken);
    const llmToken = fakeDb.tables.access_tokens.find((row) => row.token_type === "llm");
    expect(llmToken).toMatchObject({ community_id: "c1", event_id: null, llm: true });
    expect(llmToken?.token_hash).toBe(hashToken(fakeDb.lastLlmAuthorization ?? ""));
    expect(Date.parse(String(llmToken?.expires_at)) - Date.now()).toBeGreaterThan(9 * 60 * 1000);
    expect(Date.parse(String(llmToken?.expires_at)) - Date.now()).toBeLessThanOrEqual(10 * 60 * 1000);
  });

  it("rate-limits Ask requests by authorized scope with Retry-After", async () => {
    fakeDb.tables.access_tokens.push({
      token_hash: hashToken(sessionToken), token_type: "session", event_id: null, community_id: "c1",
      llm: false, expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    fakeDb.blockedRateBucket = "ask-minute:c1";
    const response = await ask(new Request("https://convene.example/api/c/northstar/ask", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `${SESSION_COOKIE}=${sessionToken}`, origin: "https://convene.example" },
      body: JSON.stringify({ question: "Who knows databases?" }),
    }), { params: Promise.resolve({ slug: "northstar" }) });
    expect(response.status).toBe(429);
    expect(response.headers.has("retry-after")).toBe(true);
    expect(fakeDb.calls).toBe(0);
  });

  it("makes no xAI call for an event where AI is disabled", async () => {
    fakeDb.tables.events = [{ ...event, ai_enabled: false }];
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "https://convene.example");
    const response = await ask(new Request("https://convene.example/api/c/northstar/ask", {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${eventToken}` },
      body: JSON.stringify({ question: "Who knows databases?" }),
    }), { params: Promise.resolve({ slug: "northstar" }) });
    expect(response.status).toBe(200);
    expect(fakeDb.calls).toBe(0);
  });

  it("bounds Ask bodies and rejects unknown JSON keys", async () => {
    const oversized = await ask(new Request("https://convene.example/api/c/northstar/ask", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: "x".repeat(3000) }),
    }), { params: Promise.resolve({ slug: "northstar" }) });
    expect(oversized.status).toBe(413);
    const unknown = await ask(new Request("https://convene.example/api/c/northstar/ask", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: "Who knows design?", extra: true }),
    }), { params: Promise.resolve({ slug: "northstar" }) });
    expect(unknown.status).toBe(400);
  });

  it("limits event-token Ask results to the authorized event", async () => {
    vi.stubEnv("NEXT_PUBLIC_BASE_URL", "http://localhost:3000");
    const response = await ask(new Request("https://convene.example/api/c/northstar/ask", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${eventToken}` },
      body: JSON.stringify({ question: "Who knows databases?" }),
    }), { params: Promise.resolve({ slug: "northstar" }) });

    expect(response.status).toBe(200);
    expect(fakeDb.mcpScopes).toEqual([
      { eventIds: ["e1"], aiEnabledOnly: true, excludeAiOptOut: true },
    ]);
  });
});
