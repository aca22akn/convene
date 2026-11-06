import { describe, expect, it } from "vitest";
import { encodeDirectoryCursor, parseDirectoryCursor } from "@/lib/directoryCursor";

describe("directory keyset cursor", () => {
  it("round-trips the exact timestamp precision and person id", () => {
    const value = encodeDirectoryCursor("2026-11-03T00:00:00.123456Z", "00000000-0000-4000-8000-000000000050");

    expect(parseDirectoryCursor(value)).toBe(value);
  });

  it("rejects malformed cursor parts before passing them to Postgres", () => {
    expect(parseDirectoryCursor("50")).toBeNull();
    expect(parseDirectoryCursor("2026-11-03T00:00:00.000Z|not-a-uuid")).toBeNull();
    expect(parseDirectoryCursor("2026-99-99T00:00:00.000Z|00000000-0000-4000-8000-000000000050")).toBeNull();
    expect(parseDirectoryCursor(null)).toBeNull();
  });
});
