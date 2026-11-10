import { describe, expect, it } from "vitest";
import { service, createCommunity, createEvent } from "./helpers";

const fixture = JSON.parse(await (await import("node:fs/promises")).readFile("data/intro_capacity_cases.json", "utf8")) as {
  members: { id: string; is_sample: boolean }[];
  existing: { a_id: string; b_id: string }[];
  proposed: { a_id: string; b_id: string; score: number; reasons: unknown[] }[];
  expectedInserted: string[];
};
const uuidByLabel = new Map(fixture.members.map((member, index) => [member.id, `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`]));

describe("atomic intro commit", () => {
  it("matches the shared TypeScript capacity fixture", async () => {
    const community = await createCommunity();
    const event = await createEvent(community.id);
    try {
      const memberRows = fixture.members.map((member) => ({
        id: uuidByLabel.get(member.id), event_id: event.id, name: member.id,
        line: `Profile for ${member.id}`, is_sample: member.is_sample, contact_consent: false,
        directory_consent: false, ai_opt_out: false, offers: [], seeks: [], topics: [], speak_topics: [],
        person_id: null, x_handle: null, speak_on: null, contact: null, source_guest_id: null,
        created_at: "2026-11-04T12:00:00.000Z",
      }));
      const { error: memberError } = await service.from("members").insert(memberRows);
      if (memberError) throw memberError;
      const existingRows = fixture.existing.map((pair, index) => ({
        id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        event_id: event.id, a_id: uuidByLabel.get(pair.a_id), b_id: uuidByLabel.get(pair.b_id), score: 0.5, reasons: [],
        created_at: "2026-11-04T12:00:00.000Z",
      }));
      const { error: existingError } = await service.from("intros").insert(existingRows);
      if (existingError) throw existingError;
      const { data, error } = await service.rpc("convene_commit_intros", {
        p_event: event.id,
        p_pairs: fixture.proposed.map((pair) => ({
          ...pair, a_id: uuidByLabel.get(pair.a_id), b_id: uuidByLabel.get(pair.b_id),
        })),
      });
      if (error) throw error;
      const labels = (data ?? []).map((pair: { a_id: string; b_id: string }) => {
        const reverse = new Map([...uuidByLabel].map(([label, id]) => [id, label]));
        return `${reverse.get(pair.a_id)}|${reverse.get(pair.b_id)}`;
      });
      expect(labels).toEqual(fixture.expectedInserted);
    } finally {
      await service.from("communities").delete().eq("id", community.id);
    }
  });

  it("serializes overlapping recompute plans without overfilling real members", async () => {
    const community = await createCommunity();
    const event = await createEvent(community.id);
    try {
      const ids = Array.from({ length: 40 }, (_, index) => `40000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
      const { error: memberError } = await service.from("members").insert(ids.map((id, index) => ({
        id, event_id: event.id, name: `Concurrent ${index + 1}`, line: `Profile ${index + 1}`, is_sample: false,
        contact_consent: false, directory_consent: false, ai_opt_out: false, offers: [], seeks: [], topics: [], speak_topics: [],
        person_id: null, x_handle: null, speak_on: null, contact: null, source_guest_id: null,
        created_at: "2026-11-04T12:00:00.000Z",
      })));
      if (memberError) throw memberError;
      const planned = ids.map((id, index) => ({
        p_event: event.id,
        p_pairs: Array.from({ length: 8 }, (_, offset) => {
          const other = ids[(index + offset + 1) % ids.length]!;
          const [a_id, b_id] = [id, other].sort();
          return { a_id, b_id, score: 1, reasons: [] };
        }),
      }));
      const attempts = await Promise.all(planned.map((args) => service.rpc("convene_commit_intros", args)));
      const failure = attempts.find((result) => result.error);
      if (failure?.error) throw failure.error;
      const { data: intros, error: introError } = await service.from("intros").select("a_id,b_id").eq("event_id", event.id);
      if (introError) throw introError;
      const degrees = new Map<string, number>();
      const pairs = (intros ?? []).map((intro) => {
        for (const memberId of [intro.a_id, intro.b_id]) degrees.set(memberId, (degrees.get(memberId) ?? 0) + 1);
        return `${intro.a_id}|${intro.b_id}`;
      });
      expect(new Set(pairs).size).toBe(pairs.length);
      expect([...degrees.values()].every((count) => count <= 2)).toBe(true);
    } finally {
      await service.from("communities").delete().eq("id", community.id);
    }
  });

  it("keeps the same capacity invariant when the 40 planned joins commit sequentially", async () => {
    const community = await createCommunity();
    const event = await createEvent(community.id);
    try {
      const ids = Array.from({ length: 40 }, (_, index) => `60000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
      const { error: memberError } = await service.from("members").insert(ids.map((id, index) => ({
        id, event_id: event.id, name: `Sequential ${index + 1}`, line: `Sequential profile ${index + 1}`, is_sample: false,
        contact_consent: false, directory_consent: false, ai_opt_out: false, offers: [], seeks: [], topics: [], speak_topics: [],
        person_id: null, x_handle: null, speak_on: null, contact: null, source_guest_id: null,
        created_at: "2026-11-04T12:00:00.000Z",
      })));
      if (memberError) throw memberError;
      for (let index = 0; index < ids.length; index += 1) {
        const p_pairs = Array.from({ length: 8 }, (_, offset) => {
          const other = ids[(index + offset + 1) % ids.length]!;
          const [a_id, b_id] = [ids[index]!, other].sort();
          return { a_id, b_id, score: 1, reasons: [] };
        });
        const { error } = await service.rpc("convene_commit_intros", { p_event: event.id, p_pairs });
        if (error) throw error;
      }
      const { data: intros, error: introError } = await service.from("intros").select("a_id,b_id").eq("event_id", event.id);
      if (introError) throw introError;
      const degrees = new Map<string, number>();
      const keys = (intros ?? []).map((intro) => {
        for (const memberId of [intro.a_id, intro.b_id]) degrees.set(memberId, (degrees.get(memberId) ?? 0) + 1);
        return `${intro.a_id}|${intro.b_id}`;
      });
      expect(new Set(keys).size).toBe(keys.length);
      expect([...degrees.values()].every((count) => count <= 2)).toBe(true);
    } finally {
      await service.from("communities").delete().eq("id", community.id);
    }
  });

  it("rejects a direct insert that exceeds member capacity", async () => {
    const community = await createCommunity();
    const event = await createEvent(community.id);
    try {
      const ids = [
        "50000000-0000-4000-8000-000000000001", "50000000-0000-4000-8000-000000000002",
        "50000000-0000-4000-8000-000000000003", "50000000-0000-4000-8000-000000000004",
      ];
      const { error: memberError } = await service.from("members").insert(ids.map((id, index) => ({
        id, event_id: event.id, name: `Backstop ${index}`, line: `Profile ${index}`, is_sample: false,
        contact_consent: false, directory_consent: false, ai_opt_out: false, offers: [], seeks: [], topics: [], speak_topics: [],
        person_id: null, x_handle: null, speak_on: null, contact: null, source_guest_id: null,
        created_at: "2026-11-04T12:00:00.000Z",
      })));
      if (memberError) throw memberError;
      const { error: seedError } = await service.from("intros").insert([
        { id: "70000000-0000-4000-8000-000000000001", event_id: event.id, a_id: ids[0], b_id: ids[1], score: 1, reasons: [], created_at: "2026-11-04T12:00:00.000Z" },
        { id: "70000000-0000-4000-8000-000000000002", event_id: event.id, a_id: ids[0], b_id: ids[2], score: 1, reasons: [], created_at: "2026-11-04T12:00:00.000Z" },
      ]);
      if (seedError) throw seedError;
      const { error } = await service.from("intros").insert({ event_id: event.id, a_id: ids[0], b_id: ids[3], score: 1, reasons: [] });
      expect(error).toBeTruthy();
      expect(error?.message).toMatch(/capacity/i);
    } finally {
      await service.from("communities").delete().eq("id", community.id);
    }
  });
});
