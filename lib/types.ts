// Shared contract for every lane. Only the integrator edits this file.
import { z } from "zod";

export const TAGS = [
  "frontend", "backend", "infra", "databases", "ai-agents", "ml", "llm-evals", "data",
  "design", "accessibility", "product", "growth", "marketing", "sales", "fundraising",
  "angel-investing", "vc", "hiring", "job-seeking", "career-returners", "cofounder",
  "community", "events", "venues", "sponsorship", "legal", "privacy", "healthtech",
  "clinical-safety", "fintech", "climate", "hardware", "robotics", "edtech", "mentoring",
  "content", "podcasting", "devrel", "speaking", "open-source",
] as const;
export const Tag = z.enum(TAGS);
export type Tag = z.infer<typeof Tag>;

/** What a person submits on the join form (or what a Luma CSV row maps to). */
export const JoinInput = z.object({
  name: z.string().trim().min(1).max(80),
  line: z.string().trim().min(3).max(280),
  x_handle: z.string().trim().max(40).optional().nullable(),
  speak_on: z.string().trim().max(160).optional().nullable(),
  contact: z.string().trim().max(120).optional().nullable(),
  contact_consent: z.boolean().default(false),
});
export type JoinInput = z.infer<typeof JoinInput>;

/** Output of extraction: every array only contains tags from TAGS. */
export const Extraction = z.object({
  offers: z.array(Tag),
  seeks: z.array(Tag),
  topics: z.array(Tag),
  speak_topics: z.array(Tag),
});
export type Extraction = z.infer<typeof Extraction>;

export const Community = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  admin_token: z.string().optional(),
});
export type Community = z.infer<typeof Community>;

export const Event = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  community_id: z.string().nullable(),
  admin_token: z.string().optional(),
  created_at: z.string().optional(),
});
export type Event = z.infer<typeof Event>;

/** Member row. `contact` is only present server-side (never in members_public). */
export const Member = z.object({
  id: z.string(),
  event_id: z.string(),
  person_id: z.string().nullable().optional(),
  name: z.string(),
  line: z.string(),
  x_handle: z.string().nullable().optional(),
  speak_on: z.string().nullable().optional(),
  contact: z.string().nullable().optional(),
  contact_consent: z.boolean().default(false),
  offers: z.array(Tag),
  seeks: z.array(Tag),
  topics: z.array(Tag),
  speak_topics: z.array(Tag),
  is_sample: z.boolean().default(false),
  created_at: z.string(),
});
export type Member = z.infer<typeof Member>;

/** A reason shown to both people. `quote` must be an exact substring of one member's line when grounded. */
export const Reason = z.object({
  text: z.string(),
  quote: z.string().nullable(),
  grounded: z.boolean(),
});
export type Reason = z.infer<typeof Reason>;

export const Intro = z.object({
  id: z.string().optional(),
  event_id: z.string(),
  a_id: z.string(), // a_id < b_id (string compare) — canonical order
  b_id: z.string(),
  score: z.number(),
  reasons: z.array(Reason),
  created_at: z.string().optional(),
});
export type Intro = z.infer<typeof Intro>;

/** A candidate edge between two members, after stage 1 (+ optional stage 2). */
export type Edge = {
  a: string; // member id, a < b
  b: string;
  tagScore: number; // raw stage-1 score
  rerank?: number; // 0-10 from Grok, undefined if not reranked
  weight: number; // final weight used by assignment
  reasons: Reason[];
};

/** /me payload */
export type MeView = {
  member: Pick<Member, "id" | "name" | "line">;
  matches: { member: Pick<Member, "id" | "name" | "line" | "x_handle">; reasons: Reason[] }[];
};

// ---- Function contracts (implemented by lanes) ----
// lib/extract.ts   export async function extract(line: string, speak_on?: string | null): Promise<Extraction & { source: "grok" | "keywords"; ms: number }>
// lib/keywords.ts  export function keywordExtract(line: string, speak_on?: string | null): Extraction
// lib/match.ts     export function tagScore(i: Member, j: Member): number
//                  export function candidates(members: Member[], k?: number): Edge[]          // top-k per member, deduped
//                  export function assignGreedy(edges: Edge[], cap?: number): Edge[]          // each member ≤ cap (2)
//                  export function assignBlossom(edges: Edge[], rounds?: number): Edge[]      // 2 rounds of max-weight matching
//                  export function templateReasons(a: Member, b: Member): Reason[]
// lib/ground.ts    export function groundReasons(reasons: {text: string; quote: string}[], a: Member, b: Member): Reason[]
// lib/rerank.ts    export async function rerank(newMember: Member, cands: Member[]): Promise<Map<string, { score: number; reasons: Reason[] }>> // keyed by candidate id
// lib/recompute.ts export async function recompute(eventId: string, newMemberId?: string): Promise<Intro[]> // inserts only new intros
