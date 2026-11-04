// Mock payloads matching the API contract, used with ?mock=1 or when the API is unreachable.
import type { MeView, Reason } from "./types";

export type LiveMember = {
  id: string;
  display_name: string;
};
export type LiveIntro = { a_id: string; b_id: string; created_at: string; headline: string };
export type LiveView = {
  event: { id: string; name: string; slug: string };
  count: number;
  members: LiveMember[];
  intros: LiveIntro[];
};
export type OrganiserMember = {
  id: string;
  name: string;
  line: string;
  offers: string[];
  seeks: string[];
  topics: string[];
  x_handle?: string | null;
  contact_consent?: boolean;
  speak_on?: string | null;
};
export type OrganiserIntro = { a_id: string; b_id: string; score: number; reasons: Reason[]; created_at?: string };
export type Speaker = {
  id: string;
  name: string;
  x_handle?: string | null;
  speak_on?: string | null;
  speak_topics: string[];
  line: string;
};
export type OrganiserView = {
  event: { name: string; slug: string; community_slug?: string | null; id?: string; ai_enabled?: boolean; joins_closed?: boolean };
  members: OrganiserMember[];
  intros: OrganiserIntro[];
  needs: Record<string, number>;
  offers: Record<string, number>;
  unmet: string[];
  speakers: Speaker[];
};
export type DirectoryView = {
  community: { name: string };
  total?: number;
  next_cursor?: string | null;
  people: {
    name: string;
    x_handle?: string | null;
    latest_line: string;
    events_count: number;
    speak_on?: string | null;
  }[];
};

const M: OrganiserMember[] = [
  { id: "m1", name: "Priya Raman", line: "Building a carbon-accounting API for SMEs, need a Python backend engineer who knows Postgres at scale", offers: ["climate"], seeks: ["backend", "databases"], topics: ["climate", "data"], x_handle: "priya" },
  { id: "m2", name: "Tom Okafor", line: "Building an open-source Postgres sharding tool, need real-world users to stress-test it", offers: ["databases", "backend", "open-source"], seeks: ["growth"], topics: ["databases"], x_handle: "tomok" },
  { id: "m3", name: "Sofia Marchetti", line: "Building a seed fund for UK climate startups, need early-stage founders with traction data", offers: ["vc", "fundraising"], seeks: ["climate"], topics: ["climate"] },
  { id: "m4", name: "James Whitfield", line: "Building an AI triage assistant for NHS GP surgeries, need a clinical safety officer", offers: ["healthtech", "ai-agents"], seeks: ["clinical-safety"], topics: ["healthtech"] },
  { id: "m5", name: "Dr Amara Mensah", line: "Building a DCB0129 clinical safety consultancy, need health-tech startups as first clients", offers: ["clinical-safety"], seeks: ["healthtech", "sales"], topics: ["healthtech"] },
];

const I: OrganiserIntro[] = [
  {
    a_id: "m1", b_id: "m2", score: 0.92, created_at: "2026-10-22T19:10:00Z",
    reasons: [
      { text: "Priya needs Postgres expertise and Tom builds Postgres tooling", quote: "need a Python backend engineer who knows Postgres at scale", grounded: true },
      { text: "Tom wants real workloads to stress-test his sharding tool", quote: "need real-world users to stress-test it", grounded: true },
    ],
  },
  {
    a_id: "m4", b_id: "m5", score: 0.95, created_at: "2026-10-22T19:12:00Z",
    reasons: [
      { text: "James needs a clinical safety officer for his NHS tool", quote: "need a clinical safety officer", grounded: true },
      { text: "Amara wants health-tech startups as first clients", quote: "need health-tech startups as first clients", grounded: true },
    ],
  },
  {
    a_id: "m1", b_id: "m3", score: 0.6, created_at: "2026-10-22T19:13:00Z",
    reasons: [
      { text: "Sofia invests in UK climate startups like Priya's", quote: "seed fund for UK climate startups", grounded: true },
      { text: "Both work on climate", quote: null, grounded: false },
    ],
  },
];

const liveMembers: LiveMember[] = M.map((m) => ({ id: m.id, display_name: m.name.trim().split(/\s+/)[0] }));
const liveIntros: LiveIntro[] = I.map((intro) => ({
  a_id: intro.a_id,
  b_id: intro.b_id,
  created_at: intro.created_at ?? "",
  headline: intro.reasons.find((reason) => reason.grounded && reason.quote)?.quote
    ? `“${intro.reasons.find((reason) => reason.grounded && reason.quote)?.quote}”`
    : intro.reasons[0]?.text ?? "",
}));

export const mockLive: LiveView = {
  event: { id: "demo-event", name: "Demo night", slug: "demo" },
  count: liveMembers.length,
  members: liveMembers,
  intros: liveIntros,
};

export const mockMe: MeView = {
  event: { id: mockLive.event.id },
  member: { id: "m1", name: M[0].name, line: M[0].line },
  matches: [
    { member: { id: "m2", name: M[1].name, line: M[1].line, x_handle: "tomok" }, reasons: I[0].reasons },
    { member: { id: "m3", name: M[2].name, line: M[2].line, x_handle: null }, reasons: I[2].reasons },
  ],
};

export const mockOrganiser: OrganiserView = {
  event: { ...mockLive.event, joins_closed: false },
  members: M.map((m, i) => ({ ...m, contact_consent: i % 2 === 0 })),
  intros: I,
  needs: { backend: 3, databases: 2, "clinical-safety": 1, climate: 2, sales: 1, design: 2 },
  offers: { databases: 2, backend: 1, climate: 1, "clinical-safety": 1, vc: 2 },
  unmet: ["design", "sales"],
  speakers: [
    { id: "m2", name: "Tom Okafor", x_handle: "tomok", speak_on: "Scaling Postgres without Kubernetes", speak_topics: ["databases", "infra"], line: M[1].line },
    { id: "m5", name: "Dr Amara Mensah", speak_on: "Clinical risk management for AI tools", speak_topics: ["clinical-safety", "healthtech"], line: M[4].line },
  ],
};

export const mockDirectory: DirectoryView = {
  community: { name: "Demo community" },
  people: M.map((m, i) => ({ name: m.name, x_handle: m.x_handle, latest_line: m.line, events_count: (i % 3) + 1, speak_on: i === 1 ? "Scaling Postgres without Kubernetes" : null })),
};
