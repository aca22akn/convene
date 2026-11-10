import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { personKey } from "@/lib/people";

describe("hashed community person keys", () => {
  beforeEach(() => vi.stubEnv("PERSON_KEY_PEPPER", "test-only-person-key-pepper"));
  afterEach(() => vi.unstubAllEnvs());

  it("normalizes handles, email casing and UK phone formats before hashing", () => {
    expect(personKey({ x_handle: "@Priya_R" })).toBe(personKey({ x_handle: "https://x.com/Priya_R" }));
    expect(personKey({ contact: "Priya@Example.com" })).toBe(personKey({ contact: " priya@example.com " }));
    expect(personKey({ contact: "07700 900123" })).toBe(personKey({ contact: "+44 7700 900123" }));
  });

  it("stores only a versioned digest, not the normalized identifier", () => {
    const emailKey = personKey({ contact: "Priya@example.com" });
    const phoneKey = personKey({ contact: "+44 7700 900123" });

    expect(emailKey).toMatch(/^h1:[a-f0-9]{64}$/);
    expect(phoneKey).toMatch(/^h1:[a-f0-9]{64}$/);
    expect(emailKey).not.toContain("@");
    expect(emailKey).not.toContain("priya");
    expect(phoneKey).not.toContain("447700900123");
  });

  it("fails in production when PERSON_KEY_PEPPER is missing", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PERSON_KEY_PEPPER", "");

    expect(() => personKey({ x_handle: "@Priya_R" })).toThrow(/PERSON_KEY_PEPPER/);
  });
});
