import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { admin, bad, connection, eventMembers, getEvent, json } = vi.hoisted(() => ({
  admin: vi.fn(),
  bad: vi.fn((message: string, status = 400) => Response.json({ error: message }, { status })),
  connection: vi.fn(async () => undefined),
  eventMembers: vi.fn(),
  getEvent: vi.fn(),
  json: vi.fn((body: unknown, status = 200, headers?: HeadersInit) => Response.json(body, { status, headers })),
}));

vi.mock("next/server", () => ({ connection }));
vi.mock("@/lib/db", () => ({ admin }));
vi.mock("@/lib/api", () => ({ bad, eventMembers, getEvent, json }));

import { GET } from "@/app/api/e/[slug]/live/route";
import { opaqueLiveMemberId } from "@/lib/public-id";

const event = { id: "event-1", slug: "demo", name: "Demo night", community_id: null, created_at: "2026-10-22T19:00:00.000Z" };

function member(id: string, name: string, index: number) {
  return {
    id,
    event_id: event.id,
    person_id: `person-${id}`,
    name,
    line: `A rich profile line ${index} with private details`.padEnd(280, "x"),
    x_handle: `handle${index}`,
    speak_on: `Talk topic ${index}`,
    contact: `person${index}@example.test`,
    contact_consent: true,
    offers: ["backend"],
    seeks: ["design"],
    topics: ["climate"],
    speak_topics: ["accessibility"],
    is_sample: false,
    created_at: `2026-10-22T19:${String(index % 60).padStart(2, "0")}:00.000Z`,
  };
}

function configureData(members: ReturnType<typeof member>[], intros: unknown[] = []) {
  const introQuery = {
    select: vi.fn(() => introQuery),
    eq: vi.fn(() => introQuery),
    order: vi.fn(async () => ({ data: intros, error: null })),
  };
  const memberQuery = {
    select: vi.fn(() => memberQuery),
    eq: vi.fn(() => memberQuery),
    order: vi.fn(async () => ({ data: members.map(({ id, name, created_at }) => ({ id, name, created_at })), error: null })),
  };
  admin.mockReturnValue({ from: vi.fn((table: string) => (table === "members" ? memberQuery : introQuery)) });
  getEvent.mockResolvedValue(event);
  eventMembers.mockResolvedValue(members);
}

describe("GET /api/e/[slug]/live", () => {
  beforeEach(() => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
    admin.mockReset();
    bad.mockClear();
    connection.mockClear();
    eventMembers.mockReset();
    getEvent.mockReset();
    json.mockClear();
  });

  afterEach(() => vi.unstubAllEnvs());

  it("returns only the stage-safe event, first names, and intro headlines", async () => {
    configureData([member("member-1", "Priya Raman", 1), member("member-2", "Tom Okafor", 2)], [
      {
        a_id: "member-1",
        b_id: "member-2",
        score: 0.9,
        created_at: "2026-10-22T19:30:00.000Z",
        reasons: [{ text: "Matching needs", quote: "Postgres", grounded: true }],
      },
    ]);

    const response = await GET(new Request("http://localhost/api/e/demo/live"), { params: Promise.resolve({ slug: "demo" }) });
    const body = await response.json();

    expect(Object.keys(body).sort()).toEqual(["count", "event", "intros", "members"]);
    expect(body.event).toEqual({ id: event.id, name: event.name, slug: event.slug });
    expect(body.members).toEqual([
      { id: opaqueLiveMemberId(event.id, "member-1"), display_name: "Priya" },
      { id: opaqueLiveMemberId(event.id, "member-2"), display_name: "Tom" },
    ]);
    expect(body.intros).toEqual([
      {
        a_id: opaqueLiveMemberId(event.id, "member-1"),
        b_id: opaqueLiveMemberId(event.id, "member-2"),
        created_at: "2026-10-22T19:30:00.000Z",
        headline: "“Postgres”",
      },
    ]);
    expect(JSON.stringify(body)).not.toContain("private details");
    expect(JSON.stringify(body)).not.toContain("@example.test");
  });

  it("returns 304 when the caller sends the current ETag", async () => {
    configureData([member("member-1", "Priya Raman", 1)], []);

    const first = await GET(new Request("http://localhost/api/e/demo/live"), { params: Promise.resolve({ slug: "demo" }) });
    const etag = first.headers.get("etag");
    expect(etag).toBeTruthy();

    const second = await GET(
      new Request("http://localhost/api/e/demo/live", { headers: { "if-none-match": etag! } }),
      { params: Promise.resolve({ slug: "demo" }) },
    );

    expect(second.status).toBe(304);
    expect(await second.text()).toBe("");
  });

  it("keeps a 200-member live response under 25 KB", async () => {
    configureData(Array.from({ length: 200 }, (_, index) => member(`member-${index}`, `Person${index} Surname`, index)), []);

    const response = await GET(new Request("http://localhost/api/e/demo/live"), { params: Promise.resolve({ slug: "demo" }) });
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(Buffer.byteLength(body, "utf8")).toBeLessThan(25 * 1024);
  });
});
