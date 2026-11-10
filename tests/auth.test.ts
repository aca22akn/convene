import { describe, expect, it } from "vitest";
import {
  SESSION_COOKIE,
  eventFilterForAuth,
  hashToken,
  makeSessionCookie,
  originMatches,
  scopeAllowsEvent,
  tokenExpired,
  tokenHashMatches,
  validReturnPath,
} from "@/lib/auth";

describe("admin token and session helpers", () => {
  it("hashes tokens and compares only equal-length hashes", () => {
    const hash = hashToken("sample-token");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(tokenHashMatches("sample-token", hash)).toBe(true);
    expect(tokenHashMatches("other-token", hash)).toBe(false);
    expect(tokenHashMatches("sample-token", "not-a-sha256-hash")).toBe(false);
  });

  it("limits event scope to its event while community scope covers its events", () => {
    expect(scopeAllowsEvent({ type: "event", eventId: "e1", communityId: "c1" }, { id: "e1", community_id: "c1" })).toBe(true);
    expect(scopeAllowsEvent({ type: "event", eventId: "e1", communityId: "c1" }, { id: "e2", community_id: "c1" })).toBe(false);
    expect(scopeAllowsEvent({ type: "community", communityId: "c1" }, { id: "e2", community_id: "c1" })).toBe(true);
    expect(scopeAllowsEvent({ type: "community", communityId: "c1" }, { id: "e2", community_id: "c2" })).toBe(false);
    expect(eventFilterForAuth({ scope: { type: "event", eventId: "e1", communityId: "c1" }, kind: "admin", via: "bearer", llm: false })).toEqual({ eventIds: ["e1"] });
    expect(eventFilterForAuth({ scope: { type: "community", communityId: "c1" }, kind: "admin", via: "bearer", llm: false })).toEqual({});
  });

  it("rejects expired or malformed session expirations", () => {
    expect(tokenExpired("2026-11-02T00:00:00.000Z", Date.parse("2026-11-02T00:00:01.000Z"))).toBe(true);
    expect(tokenExpired("2026-11-02T00:00:02.000Z", Date.parse("2026-11-02T00:00:01.000Z"))).toBe(false);
    expect(tokenExpired("not a date", Date.now())).toBe(true);
  });

  it("sets the session cookie with the required host-only security attributes", () => {
    expect(makeSessionCookie("session-id", 43_200)).toBe(
      `${SESSION_COOKIE}=session-id; Path=/; Max-Age=43200; HttpOnly; Secure; SameSite=Strict`,
    );
  });

  it("requires same-origin requests and only accepts local return paths", () => {
    expect(originMatches(new Request("https://convene.example/api", { headers: { origin: "https://convene.example" } }))).toBe(true);
    expect(originMatches(new Request("https://convene.example/api", { headers: { origin: "https://attacker.example" } }))).toBe(false);
    expect(originMatches(new Request("https://convene.example/api"))).toBe(false);
    expect(validReturnPath("/e/summit/organiser")).toBe("/e/summit/organiser");
    expect(validReturnPath("//attacker.example/steal")).toBeNull();
    expect(validReturnPath("https://attacker.example")).toBeNull();
  });
});
