import { describe, expect, it } from "vitest";
import { gaps, pairScore, rankSearch, rankSpeakersFor, summarisePeople, type CommunityMember } from "@/lib/mcpTools";
import { rankSpeakers, tagCounts } from "@/lib/api";
import type { Tag } from "@/lib/types";

const row = (id: string, person: string, event: string, at: string, over: Partial<CommunityMember>): CommunityMember & { event_slug: string } => ({
  id, event_id: event, event_slug: event, person_id: person, name: person, line: "", x_handle: null, speak_on: null,
  contact_consent: false, offers: [], seeks: [], topics: [], speak_topics: [], is_sample: true, created_at: at, ...over,
});

const rows = [
  row("m1", "Tom", "sept", "2026-09-01", { line: "Building a Postgres sharding tool", offers: ["databases", "open-source"], speak_on: "Scaling Postgres", speak_topics: ["databases", "infra"] }),
  row("m2", "Tom", "oct", "2026-10-22", { line: "Building a Postgres sharding tool v2, need users", offers: ["databases"], seeks: ["growth"], speak_on: "Scaling Postgres", speak_topics: ["databases"] }),
  row("m3", "Priya", "oct", "2026-10-22", { line: "Carbon API, need a Postgres backend engineer", offers: ["climate"], seeks: ["databases", "backend"] }),
  row("m4", "Sofia", "oct", "2026-10-22", { line: "Climate seed fund", offers: ["vc", "climate"], seeks: ["climate"], speak_on: "What climate VCs look for", speak_topics: ["vc", "climate"] }),
];

describe("community memory", () => {
  const people = summarisePeople(rows);
  it("collapses people across events and counts events", () => {
    expect(people).toHaveLength(3);
    const tom = people.find((p) => p.name === "Tom")!;
    expect(tom.events_count).toBe(2);
    expect(tom.member_id).toBe("m2"); // latest row wins
    expect(tom.event_slugs.sort()).toEqual(["oct", "sept"]);
  });

  it("search_members ranks by text and tag hits", () => {
    expect(rankSearch(people, "postgres")[0].name).toBe("Tom");
    expect(rankSearch(people, "climate investor").map((p) => p.name)).toContain("Sofia");
    expect(rankSearch(people, "zzz")).toEqual([]);
  });

  it("find_speakers only returns people who offered to speak", () => {
    const s = rankSpeakersFor(people, "postgres databases");
    expect(s.map((p) => p.name)).toEqual(["Tom"]);
    expect(rankSpeakersFor(people, "climate")[0].name).toBe("Sofia");
  });

  it("community_gaps lists needs with too few offers", () => {
    const g = gaps(people);
    expect(g.map((x) => x.tag)).toEqual(expect.arrayContaining(["backend", "growth"]));
    expect(g.find((x) => x.tag === "databases")).toBeUndefined();
  });

  it("pairScore matches the spec formula", () => {
    const t = (xs: string[]) => xs as Tag[];
    expect(pairScore({ offers: t(["databases"]), seeks: t([]), topics: t(["climate"]) }, { offers: t([]), seeks: t(["databases"]), topics: t(["climate"]) })).toBe(2.5);
  });
});

describe("organiser helpers", () => {
  it("counts needs/offers, finds unmet needs and ranks speakers", () => {
    const ms = rows.slice(1);
    const { needs, unmet } = tagCounts(ms);
    expect(unmet).toEqual(expect.arrayContaining(["backend", "growth"]));
    const sp = rankSpeakers(ms, needs);
    expect(sp[0].name).toBe("Sofia"); // 2 speak topics, climate is in demand
    expect(sp.map((s) => s.name)).not.toContain("Priya");
  });
});
