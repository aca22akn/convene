import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";

const { admin, bad, connection, getEvent, json } = vi.hoisted(() => ({
  admin: vi.fn(),
  bad: vi.fn((message: string, status = 400) => Response.json({ error: message }, { status })),
  connection: vi.fn(async () => undefined),
  getEvent: vi.fn(),
  json: vi.fn((body: unknown, status = 200, headers?: HeadersInit) => Response.json(body, { status, headers })),
}));

vi.mock("next/server", () => ({ connection }));
vi.mock("@/lib/db", () => ({ admin }));
vi.mock("@/lib/api", () => ({ bad, getEvent, json, PUBLIC_MEMBER_COLS: "id,name,line,x_handle,speak_on,offers,seeks,topics,speak_topics,person_id,is_sample,created_at" }));

import { GET as liveGET } from "@/app/api/e/[slug]/live/route";
import { GET as meGET } from "@/app/api/e/[slug]/me/route";

const event = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", slug: "demo", name: "Demo night", community_id: null };
const rawMemberIds = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
const members = rawMemberIds.map((id, index) => ({
  id,
  event_id: event.id,
  name: index === 0 ? "Priya Raman" : "Tom Okafor",
  line: "Rich private profile text that must only appear on the member's own results page",
  created_at: `2026-11-02T19:0${index}:00.000Z`,
}));
const intros = [{
  a_id: rawMemberIds[0], b_id: rawMemberIds[1], created_at: "2026-11-02T19:10:00.000Z",
  reasons: [{ text: "A grounded reason", quote: "Postgres", grounded: true }],
}];

const expectedOpaqueId = (eventId: string, memberId: string) => createHmac("sha256", "test-public-id-secret")
  .update(`convene-live-member-id:v1:${eventId}:${memberId}`)
  .digest("base64url");

function createQuery(table: string) {
  let selected = "";
  let lookupId = "";
  const builder = {
    select: vi.fn((columns: string) => { selected = columns; return builder; }),
    eq: vi.fn((column: string, value: string) => { if (column === "id") lookupId = value; return builder; }),
    in: vi.fn(() => builder),
    order: vi.fn(async () => ({ data: table === "members" ? members : intros, error: null })),
    maybeSingle: vi.fn(async () => ({ data: lookupId === members[0].id ? members[0] : null, error: null })),
    or: vi.fn(() => builder),
    then: (resolve: (value: { data: unknown[] | null; count?: number; error: null }) => unknown, reject?: (reason: unknown) => unknown) => {
      const result = table === "members" && selected === "id"
        ? { data: null, count: members.length, error: null }
        : { data: table === "members" && selected.includes("name") ? members : intros, error: null };
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  return builder;
}

describe("public live IDs cannot recover a member profile", () => {
  beforeEach(() => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
    vi.stubEnv("PUBLIC_ID_SECRET", "test-public-id-secret");
    admin.mockReset().mockReturnValue({ from: vi.fn((table: string) => createQuery(table)) });
    bad.mockClear();
    connection.mockClear();
    getEvent.mockReset().mockResolvedValue(event);
    json.mockClear();
  });

  afterEach(() => vi.unstubAllEnvs());

  it("uses stable event-scoped opaque IDs and does not let a live ID retrieve /me", async () => {
    const response = await liveGET(
      new Request("http://localhost/api/e/demo/live"),
      { params: Promise.resolve({ slug: "demo" }) },
    );
    const body = await response.json();
    const publicIds = body.members.map((member: { id: string }) => member.id);

    expect(publicIds).toEqual(rawMemberIds.map((id) => expectedOpaqueId(event.id, id)));
    expect(publicIds).not.toContain(rawMemberIds[0]);
    expect(body.intros[0].a_id).toBe(publicIds[0]);
    expect(body.intros[0].b_id).toBe(publicIds[1]);
    expect(expectedOpaqueId(event.id, rawMemberIds[0])).not.toBe(expectedOpaqueId("another-event", rawMemberIds[0]));

    const profileResponse = await meGET(
      new Request(`http://localhost/api/e/demo/me?id=${encodeURIComponent(publicIds[0])}`),
      { params: Promise.resolve({ slug: "demo" }) },
    );
    expect(profileResponse.status).toBe(400);
    expect(await profileResponse.text()).not.toContain("Rich private profile text");
  });

  it("returns the event ID and room size needed for private member-page status", async () => {
    const response = await meGET(
      new Request(`http://localhost/api/e/demo/me?id=${encodeURIComponent(rawMemberIds[0])}`),
      { params: Promise.resolve({ slug: "demo" }) },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ event: { id: event.id, member_count: members.length } });
    expect(response.headers.get("etag")).toBeTruthy();
  });

  it("returns 304 for an unchanged /me view with the current ETag", async () => {
    const url = `http://localhost/api/e/demo/me?id=${encodeURIComponent(rawMemberIds[0])}`;
    const first = await meGET(new Request(url), { params: Promise.resolve({ slug: "demo" }) });
    const etag = first.headers.get("etag");
    expect(etag).toBeTruthy();

    const second = await meGET(new Request(url, { headers: { "if-none-match": etag! } }), { params: Promise.resolve({ slug: "demo" }) });
    expect(second.status).toBe(304);
    expect(await second.text()).toBe("");
  });
});
