import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { rankSearch, summarisePeople, type CommunityMember, type PersonSummary } from "@/lib/mcpTools";
import { tagsIn } from "@/lib/keywords";
import { TAGS, type Tag } from "@/lib/types";
import { anon, createCommunity, createEvent, service } from "./helpers";

type FixtureMember = CommunityMember & { event_slug: string };

function memberRow(input: {
  eventId: string;
  eventSlug: string;
  personId?: string;
  name: string;
  line: string;
  createdAt: string;
  directoryConsent: boolean;
  aiOptOut?: boolean;
  offers?: Tag[];
  seeks?: Tag[];
  speakOn?: string | null;
  speakTopics?: Tag[];
}): FixtureMember & { contact: null; directory_consent: boolean; ai_opt_out: boolean } {
  return {
    id: randomUUID(),
    event_id: input.eventId,
    event_slug: input.eventSlug,
    person_id: input.personId ?? randomUUID(),
    name: input.name,
    line: input.line,
    x_handle: null,
    speak_on: input.speakOn ?? null,
    contact: null,
    contact_consent: false,
    directory_consent: input.directoryConsent,
    ai_opt_out: input.aiOptOut ?? false,
    offers: input.offers ?? [],
    seeks: input.seeks ?? [],
    topics: [],
    speak_topics: input.speakTopics ?? [],
    is_sample: false,
    created_at: input.createdAt,
  };
}

async function insertMembers(rows: ReturnType<typeof memberRow>[]) {
  const { error } = await service.from("members").insert(rows.map((row) => {
    const { event_slug, ...databaseRow } = row;
    void event_slug;
    return databaseRow;
  }));
  if (error) throw error;
}

function searchTags(query: string) {
  const lower = query.toLowerCase();
  return [...new Set([...tagsIn(query), ...TAGS.filter((tag) => lower.includes(tag))])];
}

describe("database-side community queries", () => {
  const communityIds: string[] = [];

  afterAll(async () => {
    if (communityIds.length === 0) return;
    const { error } = await service.from("communities").delete().in("id", communityIds);
    if (error) throw error;
  });

  it("filters directory consent, summarizes the latest row, and paginates with a stable keyset cursor", async () => {
    const community = await createCommunity();
    communityIds.push(community.id);
    const firstEvent = await createEvent(community.id);
    const secondEvent = await createEvent(community.id);
    const sharedPersonId = randomUUID();
    const fixture = Array.from({ length: 52 }, (_, index) => memberRow({
      eventId: firstEvent.id,
      eventSlug: firstEvent.slug,
      personId: index === 0 ? sharedPersonId : undefined,
      name: `Directory ${String(index).padStart(2, "0")}`,
      line: `Building directory project ${index}`,
      createdAt: new Date(Date.UTC(2026, 10, 1, 0, index)).toISOString(),
      directoryConsent: index !== 51,
    }));
    fixture.push(memberRow({
      eventId: secondEvent.id,
      eventSlug: secondEvent.slug,
      personId: sharedPersonId,
      name: "Directory latest",
      line: "Latest line from the second event",
      createdAt: "2026-11-03T00:00:00.000Z",
      directoryConsent: true,
    }));
    await insertMembers(fixture);

    const args = { p_community: community.id, p_event_ids: null, p_limit: 50, p_after: null };
    const first = await service.rpc("community_people", args);
    const repeatedFirst = await service.rpc("community_people", args);
    if (first.error) throw first.error;
    if (repeatedFirst.error) throw repeatedFirst.error;
    const firstPage = first.data as { total: number; people: PersonSummary[]; next_cursor: string | null };
    const repeatedPage = repeatedFirst.data as { people: PersonSummary[] };

    expect(firstPage.total).toBe(51);
    expect(firstPage.people).toHaveLength(50);
    expect(firstPage.people.map((person) => person.person_id)).toEqual(repeatedPage.people.map((person) => person.person_id));
    expect(firstPage.people.some((person) => person.name === "Directory 51")).toBe(false);
    expect(firstPage.next_cursor).toBeTruthy();

    const latest = firstPage.people.find((person) => person.person_id === sharedPersonId);
    expect(latest).toMatchObject({
      name: "Directory latest",
      line: "Latest line from the second event",
      events_count: 2,
      event_slugs: [firstEvent.slug, secondEvent.slug].sort(),
    });

    const second = await service.rpc("community_people", {
      ...args,
      p_after: firstPage.next_cursor,
    });
    if (second.error) throw second.error;
    const secondPage = second.data as { total: number; people: PersonSummary[]; next_cursor: string | null };
    const allIds = [...firstPage.people, ...secondPage.people].map((person) => person.person_id);
    expect(secondPage.total).toBe(51);
    expect(secondPage.people).toHaveLength(1);
    expect(secondPage.next_cursor).toBeNull();
    expect(new Set(allIds).size).toBe(51);

    const scoped = await service.rpc("community_people", { ...args, p_event_ids: [firstEvent.id], p_limit: 2 });
    if (scoped.error) throw scoped.error;
    const scopedPage = scoped.data as { total: number; people: PersonSummary[] };
    expect(scopedPage.total).toBe(51);
    expect(scopedPage.people).toHaveLength(2);
    expect(scopedPage.people.every((person) => person.events_count === 1)).toBe(true);
  });

  it("matches the pure TypeScript ranker and enforces event, AI, and query limits", async () => {
    const community = await createCommunity();
    communityIds.push(community.id);
    const enabled = await createEvent(community.id, service, 200, true);
    const disabled = await createEvent(community.id, service, 200, false);
    const personId = randomUUID();
    const rows = [
      memberRow({
        eventId: enabled.id, eventSlug: enabled.slug, personId, name: "Priya", line: "Building a postgres analytics tool",
        createdAt: "2026-11-01T00:00:00.000Z", directoryConsent: false, offers: ["databases"], seeks: ["backend"],
        speakOn: "Postgres scaling", speakTopics: ["databases"],
      }),
      memberRow({
        eventId: enabled.id, eventSlug: enabled.slug, name: "Climate speaker", line: "Climate investing and postgres",
        createdAt: "2026-11-01T00:00:01.000Z", directoryConsent: true, aiOptOut: true, offers: ["climate"],
        speakOn: "Climate investing", speakTopics: ["climate"],
      }),
      memberRow({
        eventId: enabled.id, eventSlug: enabled.slug, name: "Backend builder", line: "Unrelated profile text",
        createdAt: "2026-11-01T00:00:02.000Z", directoryConsent: false, offers: ["backend"],
      }),
      memberRow({
        eventId: disabled.id, eventSlug: disabled.slug, name: "Disabled event", line: "postgres backend",
        createdAt: "2026-11-01T00:00:03.000Z", directoryConsent: true, offers: ["databases"],
      }),
    ];
    await insertMembers(rows);

    const query = "postgres";
    const allSearch = await service.rpc("search_members", {
      p_community: community.id, p_event_ids: null, p_query: query, p_tags: searchTags(query), p_limit: 50,
      p_ai_enabled_only: false, p_exclude_ai_opt_out: false,
    });
    if (allSearch.error) throw allSearch.error;
    const allSearchData = allSearch.data as { people: PersonSummary[]; total: number };
    const pureResults = rankSearch(summarisePeople(rows), query).map((person) => person.member_id);
    expect(allSearchData.people.map((person) => person.member_id)).toEqual(pureResults);
    expect(allSearchData.people).toHaveLength(3);

    const scopedSearch = await service.rpc("search_members", {
      p_community: community.id, p_event_ids: [enabled.id], p_query: query, p_tags: searchTags(query), p_limit: 1,
      p_ai_enabled_only: true, p_exclude_ai_opt_out: true,
    });
    if (scopedSearch.error) throw scopedSearch.error;
    const scopedData = scopedSearch.data as { people: PersonSummary[] };
    expect(scopedData.people).toHaveLength(1);
    expect(scopedData.people[0].member_id).toBe(rows[0].id);

    const gaps = await service.rpc("community_gaps", {
      p_community: community.id, p_event_ids: [enabled.id], p_ai_enabled_only: true, p_exclude_ai_opt_out: true,
    });
    if (gaps.error) throw gaps.error;
    expect(gaps.data).toMatchObject({ members: 2 });

    const [introA, introB] = [rows[0].id, rows[2].id].sort();
    const { error: introError } = await service.from("intros").insert({
      id: randomUUID(), event_id: enabled.id, a_id: introA, b_id: introB, score: 0.75,
      reasons: [{ text: "Existing intro", quote: null, grounded: false }], created_at: "2026-11-01T00:01:00.000Z",
    });
    if (introError) throw introError;

    const suggestions = await service.rpc("suggest_intro_candidates", {
      p_community: community.id, p_event_ids: [enabled.id], p_member_id: rows[0].id, p_limit: 1,
      p_ai_enabled_only: true, p_exclude_ai_opt_out: true,
    });
    if (suggestions.error) throw suggestions.error;
    const suggestionData = suggestions.data as {
      member: { id: string };
      candidates: { member_id: string }[];
      existing_intros: { name: string; reasons: string[] }[];
    };
    expect(suggestionData.member.id).toBe(rows[0].id);
    expect(suggestionData.candidates).toHaveLength(1);
    expect(suggestionData.candidates[0].member_id).toBe(rows[2].id);
    expect(suggestionData.existing_intros).toEqual([{ name: "Backend builder", line: "Unrelated profile text", score: 0.75, reasons: ["Existing intro"] }]);
  });

  it("keeps all community query functions service-role-only", async () => {
    const community = await createCommunity();
    communityIds.push(community.id);
    const args: Record<string, Record<string, unknown>> = {
      community_people: { p_community: community.id, p_event_ids: null, p_limit: 10, p_after: null },
      community_gaps: { p_community: community.id, p_event_ids: null },
      search_members: { p_community: community.id, p_event_ids: null, p_query: "test", p_tags: [], p_limit: 10 },
      suggest_intro_candidates: { p_community: community.id, p_event_ids: null, p_member_id: randomUUID(), p_limit: 8 },
    };

    for (const [functionName, parameters] of Object.entries(args)) {
      const { error } = await anon.rpc(functionName, parameters);
      expect(error, `${functionName} must reject anon`).toBeTruthy();
      expect(`${error?.code} ${error?.message}`).toMatch(/permission|privilege|not allowed|unauthorized/i);
    }
  });
});
