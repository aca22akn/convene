import { describe, expect, it } from "vitest";
import { candidates } from "@/lib/match";
import { planIntros } from "@/lib/recompute";
import { TAGS, type Member, type Tag } from "@/lib/types";

type ScoreReads = { reads: number; byMember: Map<string, number> };

function countRead(id: string, evaluations: ScoreReads) {
  evaluations.reads++;
  evaluations.byMember.set(id, (evaluations.byMember.get(id) ?? 0) + 1);
}

function countedMember(id: string, offers: Tag[], seeks: Tag[], evaluations: ScoreReads): Member {
  return {
    id,
    event_id: "event-1",
    name: id,
    line: `line for ${id}`,
    get offers() {
      countRead(id, evaluations);
      return offers;
    },
    get seeks() {
      countRead(id, evaluations);
      return seeks;
    },
    get topics() {
      countRead(id, evaluations);
      return [];
    },
    speak_topics: [],
    contact_consent: false,
    is_sample: false,
    created_at: "2026-11-01T12:00:00.000Z",
  };
}

function sparseRoom(size: number, reads: ScoreReads): Member[] {
  return Array.from({ length: size }, (_, index) =>
    countedMember(
      `member-${String(index).padStart(4, "0")}`,
      [TAGS[index % TAGS.length]],
      [TAGS[(index + 1) % TAGS.length]],
      reads,
    ),
  );
}

describe("bounded tag candidate generation", () => {
  it.each([200, 400])("scores only indexed overlaps for %i members", (size) => {
    const reads: ScoreReads = { reads: 0, byMember: new Map() };
    const members = sparseRoom(size, reads);

    candidates(members);

    // Indexing and candidate collection read six fields per member; tagScore reads six per pair.
    const pairEvaluations = (reads.reads - 6 * size) / 6;
    expect(pairEvaluations).toBeLessThanOrEqual(32 * size);
  });

  it("does not score members whose intro capacity is exhausted", () => {
    const reads: ScoreReads = { reads: 0, byMember: new Map() };
    const eligible = sparseRoom(8, reads);
    const full = Array.from({ length: 20 }, (_, index) =>
      countedMember(`full-${index}`, ["backend"], ["databases"], reads),
    );
    const existing = full.flatMap((member) =>
      [0, 1].map((slot) => ({ a_id: member.id, b_id: `already-met-${member.id}-${slot}` })),
    );

    planIntros([...eligible, ...full], existing);

    expect(reads.reads).toBeGreaterThan(0);
    expect(full.every((member) => !reads.byMember.has(member.id))).toBe(true);
  });

  it("limits a newcomer recompute to pairs involving that newcomer", () => {
    const oldA = countedMember("old-a", ["backend"], ["databases"], { reads: 0, byMember: new Map() });
    const oldB = countedMember("old-b", ["databases"], ["backend"], { reads: 0, byMember: new Map() });
    const newcomer = countedMember("new", [], [], { reads: 0, byMember: new Map() });

    expect(planIntros([oldA, oldB, newcomer], [], newcomer.id)).toEqual([]);
  });
});
