import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { addIntroCapacity, capacities, canAddIntro } from "@/lib/recompute";
import type { Member } from "@/lib/types";

const fixture = JSON.parse(readFileSync("data/intro_capacity_cases.json", "utf8")) as {
  maxIntros: number;
  members: { id: string; is_sample: boolean }[];
  existing: { a_id: string; b_id: string }[];
  proposed: { a_id: string; b_id: string; score: number; reasons: unknown[] }[];
  expectedInserted: string[];
};

describe("TypeScript and SQL intro capacity parity fixture", () => {
  it("applies the sample and real member rules in proposal order", () => {
    expect(fixture.maxIntros).toBe(2);
    const caps = capacities(fixture.members as Pick<Member, "id" | "is_sample">[], fixture.existing);
    const inserted: string[] = [];
    for (const pair of fixture.proposed) {
      if (!canAddIntro(caps, pair.a_id, pair.b_id)) continue;
      inserted.push(`${pair.a_id}|${pair.b_id}`);
      addIntroCapacity(caps, pair.a_id, pair.b_id);
    }
    expect(inserted).toEqual(fixture.expectedInserted);
  });
});
