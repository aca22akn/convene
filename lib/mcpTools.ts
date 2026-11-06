// Read-only community queries behind the MCP server and the "Ask your community" box.
// Pure helpers (rank*) take loaded rows so they are unit-testable; load* functions hit Supabase.
import { admin } from "./db";
import { tagsIn } from "./keywords";
import { TAGS, type Member, type Tag } from "./types";

export type CommunityMember = Omit<Member, "contact">;
export type PersonSummary = {
  person_id: string;
  member_id: string; // most recent member row
  name: string;
  x_handle: string | null;
  line: string;
  speak_on: string | null;
  offers: Tag[];
  seeks: Tag[];
  speak_topics: Tag[];
  events_count: number;
  event_slugs: string[];
};

/** Collapse member rows to one entry per person (latest row wins), counting distinct events. */
export function summarisePeople(rows: (CommunityMember & { event_slug?: string })[]): PersonSummary[] {
  const by = new Map<string, PersonSummary & { _t: string }>();
  for (const m of rows) {
    const pid = m.person_id || m.id;
    const prev = by.get(pid);
    const slugs = new Set(prev?.event_slugs ?? []);
    if (m.event_slug) slugs.add(m.event_slug);
    const newer = !prev || m.created_at > prev._t || (m.created_at === prev._t && m.id > prev.member_id);
    const base = newer
      ? {
          person_id: pid, member_id: m.id, name: m.name, x_handle: m.x_handle ?? null, line: m.line,
          speak_on: m.speak_on ?? null, offers: m.offers, seeks: m.seeks, speak_topics: m.speak_topics, _t: m.created_at,
        }
      : prev!;
    by.set(pid, { ...base, event_slugs: [...slugs].sort(), events_count: 0 });
  }
  // events_count: distinct event ids per person
  const evCount = new Map<string, Set<string>>();
  for (const m of rows) {
    const pid = m.person_id || m.id;
    if (!evCount.has(pid)) evCount.set(pid, new Set());
    evCount.get(pid)!.add(m.event_id);
  }
  return [...by.values()].map((p) => ({
    person_id: p.person_id,
    member_id: p.member_id,
    name: p.name,
    x_handle: p.x_handle,
    line: p.line,
    speak_on: p.speak_on,
    offers: p.offers,
    seeks: p.seeks,
    speak_topics: p.speak_topics,
    event_slugs: p.event_slugs,
    events_count: evCount.get(p.person_id)!.size,
  }));
}

const words = (q: string) => q.toLowerCase().split(/\W+/).filter((w) => w.length > 2);

export function rankSearch(people: PersonSummary[], query: string): PersonSummary[] {
  const qTags = new Set<Tag>([...tagsIn(query), ...TAGS.filter((t) => query.toLowerCase().includes(t))]);
  const ws = words(query);
  return people
    .map((p) => {
      const hay = `${p.name} ${p.line} ${p.speak_on ?? ""}`.toLowerCase();
      const textHits = ws.filter((w) => hay.includes(w)).length;
      const tagHits = [...p.offers, ...p.seeks, ...p.speak_topics].filter((t) => qTags.has(t)).length;
      return { p, s: textHits * 2 + tagHits };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || b.p.events_count - a.p.events_count || (a.p.person_id < b.p.person_id ? -1 : a.p.person_id > b.p.person_id ? 1 : 0))
    .map((x) => x.p);
}

export function rankSpeakersFor(people: PersonSummary[], topic: string): PersonSummary[] {
  const tTags = new Set<Tag>([...tagsIn(topic), ...TAGS.filter((t) => topic.toLowerCase().includes(t))]);
  const ws = words(topic);
  return people
    .map((p) => {
      const tagHits = p.speak_topics.filter((t) => tTags.has(t)).length;
      const textHits = ws.filter((w) => (p.speak_on ?? "").toLowerCase().includes(w)).length;
      return { p, s: tagHits * 2 + textHits };
    })
    .filter((x) => x.s > 0 && (x.p.speak_on || x.p.speak_topics.length))
    .sort((a, b) => b.s - a.s || b.p.events_count - a.p.events_count || (a.p.person_id < b.p.person_id ? -1 : a.p.person_id > b.p.person_id ? 1 : 0))
    .map((x) => x.p);
}

export function gaps(people: PersonSummary[]) {
  const needs: Record<string, number> = {};
  const offers: Record<string, number> = {};
  for (const p of people) {
    for (const t of p.seeks) needs[t] = (needs[t] ?? 0) + 1;
    for (const t of p.offers) offers[t] = (offers[t] ?? 0) + 1;
  }
  return Object.keys(needs)
    .map((tag) => ({ tag, seekers: needs[tag], offerers: offers[tag] ?? 0 }))
    .filter((g) => g.offerers < g.seekers)
    .sort((a, b) => b.seekers - b.offerers - (a.seekers - a.offerers) || a.tag.localeCompare(b.tag));
}

/** Pairwise score, same formula as lib/match.ts tagScore (kept local so MCP never depends on matching internals). */
export function pairScore(i: Pick<PersonSummary, "offers" | "seeks"> & { topics?: Tag[] }, j: Pick<PersonSummary, "offers" | "seeks"> & { topics?: Tag[] }) {
  const inter = (a: Tag[] = [], b: Tag[] = []) => a.filter((x) => b.includes(x)).length;
  return 2 * inter(i.offers, j.seeks) + 2 * inter(j.offers, i.seeks) + 0.5 * inter(i.topics, j.topics);
}

export type MemberScopeFilter = { eventIds?: string[]; aiEnabledOnly?: boolean; excludeAiOptOut?: boolean };

const brief = (p: PersonSummary) => ({
  member_id: p.member_id, name: p.name, x_handle: p.x_handle, line: p.line, speak_on: p.speak_on,
  offers: p.offers, seeks: p.seeks, seen_at_events: p.events_count,
});

type SearchRpcResult = { people: PersonSummary[]; total: number };
type GapRpcResult = { members: number; gaps: ReturnType<typeof gaps> };
type SuggestionRpcResult = {
  member: Pick<CommunityMember, "id" | "person_id" | "name" | "line" | "offers" | "seeks" | "topics"> | null;
  candidates: PersonSummary[];
  existing_intros: { name: string; line: string; score: number; reasons: string[] }[];
};

const queryTags = (query: string): Tag[] => {
  const lower = query.toLowerCase();
  return [...new Set<Tag>([...tagsIn(query), ...TAGS.filter((tag) => lower.includes(tag))])];
};

function scopeArgs(communityId: string | null, scope: MemberScopeFilter) {
  return {
    p_community: communityId,
    p_event_ids: scope.eventIds ?? null,
    p_ai_enabled_only: scope.aiEnabledOnly === true,
    p_exclude_ai_opt_out: scope.excludeAiOptOut === true,
  };
}

async function loadSearchRows(communityId: string | null, query: string, limit: number, scope: MemberScopeFilter): Promise<PersonSummary[]> {
  if (scope.eventIds?.length === 0 || (!communityId && !scope.eventIds)) return [];
  const { data, error } = await admin().rpc("search_members", {
    ...scopeArgs(communityId, scope),
    p_query: query,
    p_tags: queryTags(query),
    p_limit: limit,
  });
  if (error) throw error;
  return ((data as SearchRpcResult | null)?.people ?? []).slice(0, limit);
}

export async function searchMembers(communityId: string | null, query: string, scope: MemberScopeFilter = {}) {
  const people = await loadSearchRows(communityId, query, 50, scope);
  return rankSearch(people, query).slice(0, 15).map(brief);
}

export async function findSpeakers(communityId: string | null, topic: string, scope: MemberScopeFilter = {}) {
  const people = await loadSearchRows(communityId, topic, 50, scope);
  return rankSpeakersFor(people, topic).slice(0, 10).map(brief);
}

export async function communityGaps(communityId: string | null, scope: MemberScopeFilter = {}) {
  if (scope.eventIds?.length === 0 || (!communityId && !scope.eventIds)) return { members: 0, gaps: [] };
  const { data, error } = await admin().rpc("community_gaps", scopeArgs(communityId, scope));
  if (error) throw error;
  const result = data as GapRpcResult | null;
  return { members: result?.members ?? 0, gaps: (result?.gaps ?? []).slice(0, 15) };
}

export async function loadAskContext(communityId: string | null, query: string, scope: MemberScopeFilter = {}) {
  const [people, gapResult] = await Promise.all([
    loadSearchRows(communityId, query, 50, scope),
    communityGaps(communityId, scope),
  ]);
  return {
    search_members: rankSearch(people, query).slice(0, 10).map(brief),
    find_speakers: rankSpeakersFor(people, query).slice(0, 5).map(brief),
    community_gaps: gapResult,
  };
}

export async function suggestIntros(communityId: string | null, memberId: string, scope: MemberScopeFilter = {}) {
  if (scope.eventIds?.length === 0 || (!communityId && !scope.eventIds)) return { error: "member not found in this community" };
  const { data, error } = await admin().rpc("suggest_intro_candidates", {
    ...scopeArgs(communityId, scope),
    p_member_id: memberId,
    p_limit: 8,
  });
  if (error) throw error;
  const result = data as SuggestionRpcResult | null;
  const me = result?.member;
  if (!me) return { error: "member not found in this community" };
  const candidates = result?.candidates ?? [];
  const myPid = me.person_id || me.id;
  const suggestions = candidates
    .filter((person) => person.person_id !== myPid)
    .map((p) => ({ p, s: pairScore(me, p) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 5)
    .map((x) => ({ ...brief(x.p), tag_score: x.s }));
  return { member: { name: me.name, line: me.line }, existing_intros: result?.existing_intros ?? [], suggestions };
}
