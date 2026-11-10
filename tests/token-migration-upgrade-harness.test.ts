import { describe, expect, it } from "vitest";
import { mergeCleanupError, parseDatabaseContainerId } from "../scripts/test-token-migration-upgrade-helpers.mjs";

describe("token migration upgrade harness helpers", () => {
  it("finds only the exact local database container name", () => {
    const output = [
      "malformed",
      "111111111111 supabase_auth_convene",
      "222222222222 supabase_db_convene-old",
      "333333333333 supabase_db_convene",
      "444444444444 another-name,supabase_db_other",
    ].join("\n");

    expect(parseDatabaseContainerId(output, "supabase_db_convene")).toBe("333333333333");
    expect(parseDatabaseContainerId(output, "supabase_db_missing")).toBeUndefined();
  });

  it("merges a cleanup failure into the original failure", () => {
    const primary = new Error("migration up failed");
    const cleanup = new Error("resetting role failed");
    const merged = mergeCleanupError(primary, cleanup);

    expect(merged.message).toBe("migration up failed\nCleanup also failed:\nresetting role failed");
    expect(merged.cause).toBe(primary);
  });

  it("preserves a lone error without wrapping it", () => {
    const primary = new Error("migration up failed");
    const cleanup = new Error("resetting role failed");

    expect(mergeCleanupError(primary, undefined)).toBe(primary);
    expect(mergeCleanupError(undefined, cleanup)).toBe(cleanup);
  });
});
