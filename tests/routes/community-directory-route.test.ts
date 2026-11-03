import { beforeEach, describe, expect, it, vi } from "vitest";

const { admin, connection } = vi.hoisted(() => ({
  admin: vi.fn(),
  connection: vi.fn(async () => undefined),
}));

vi.mock("next/server", () => ({ connection }));
vi.mock("@/lib/db", () => ({ admin }));

import { GET } from "@/app/api/c/[slug]/route";

const community = { id: "community-1", slug: "makers", name: "Makers" };
const events = [{ id: "event-1", slug: "makers-1", name: "Makers 1", created_at: "2026-10-22T19:00:00.000Z" }];

let rows: ReturnType<typeof directoryRow>[] = [];

function directoryRow(index: number, directoryConsent: boolean) {
  return {
    id: `member-${index}`,
    event_id: "event-1",
    person_id: `person-${index}`,
    name: `Member ${String(index).padStart(3, "0")}`,
    line: `Building project ${index}`,
    x_handle: `member${index}`,
    speak_on: null,
    offers: ["backend"],
    seeks: ["design"],
    speak_topics: [],
    created_at: `2026-10-22T19:${String(index % 60).padStart(2, "0")}:00.000Z`,
    event_slug: "makers-1",
    directory_consent: directoryConsent,
  };
}

function configureQueries() {
  function query(data: unknown) {
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      in: vi.fn(() => builder),
      order: vi.fn(() => builder),
      maybeSingle: vi.fn(async () => ({ data: Array.isArray(data) ? data[0] : data, error: null })),
      then: (
        resolve: (result: { data: unknown; error: null }) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => Promise.resolve({ data, error: null }).then(resolve, reject),
    };
    return builder;
  }
  admin.mockReturnValue({
    from: vi.fn((table: string) => {
      if (table === "communities") return query(community);
      if (table === "events") return query(events);
      return query(rows);
    }),
  });
}

describe("GET /api/c/[slug]", () => {
  beforeEach(() => {
    admin.mockReset();
    connection.mockClear();
    rows = [];
    configureQueries();
  });

  it("returns only members whose directory consent is true", async () => {
    rows = [
      directoryRow(1, false),
      directoryRow(2, true),
      directoryRow(3, false),
    ];

    const response = await GET(new Request("http://localhost/api/c/makers"), { params: Promise.resolve({ slug: "makers" }) });
    const body = await response.json();

    expect(body.people).toHaveLength(1);
    expect(Object.keys(body).sort()).toEqual(["community", "next_cursor", "people", "total"]);
    expect(Object.keys(body.community)).toEqual(["name"]);
    expect(Object.keys(body.people[0]).sort()).toEqual(["events_count", "latest_line", "name", "speak_on", "x_handle"]);
    expect(body.people[0]).toMatchObject({ name: "Member 002" });
    expect(JSON.stringify(body)).not.toContain("Member 001");
    expect(JSON.stringify(body)).not.toContain("Member 003");
  });

  it("paginates consenting people with a stable cursor and no duplicates", async () => {
    rows = Array.from({ length: 51 }, (_, index) => directoryRow(index, true));

    const first = await GET(
      new Request("http://localhost/api/c/makers?limit=50"),
      { params: Promise.resolve({ slug: "makers" }) },
    );
    const firstBody = await first.json();
    expect(firstBody.people).toHaveLength(50);
    expect(firstBody.next_cursor).toBeTruthy();

    const second = await GET(
      new Request(`http://localhost/api/c/makers?limit=50&cursor=${encodeURIComponent(firstBody.next_cursor)}`),
      { params: Promise.resolve({ slug: "makers" }) },
    );
    const secondBody = await second.json();
    const firstNames = new Set(firstBody.people.map((person: { name: string }) => person.name));

    expect(secondBody.people).toHaveLength(1);
    expect(secondBody.people.every((person: { name: string }) => !firstNames.has(person.name))).toBe(true);
    expect(secondBody.next_cursor).toBeNull();
  });
});
