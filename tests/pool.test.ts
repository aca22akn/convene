import { describe, expect, it } from "vitest";
import { pool } from "@/lib/extract";

describe("pool settle-all semantics", () => {
  it("reports a failed row only after every worker has settled", async () => {
    let settled = 0;
    const result = await pool(Array.from({ length: 10 }, (_, index) => index + 1), 4, async (row) => {
      try {
        await new Promise((resolve) => setTimeout(resolve, row === 3 ? 15 : 2));
        if (row === 3) throw new Error("injected row failure");
        return `id-${row}`;
      } finally {
        settled += 1;
      }
    });
    expect(settled).toBe(10);
    expect(result).toHaveLength(10);
    expect(result[2]).toMatchObject({ row: 3, ok: false });
    expect(result.filter((row) => row.ok)).toHaveLength(9);
  });
});
