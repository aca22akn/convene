import { beforeEach, describe, expect, it, vi } from "vitest";
import { admin } from "@/lib/db";
import { POST } from "@/app/api/events/route";

vi.mock("@/lib/db", () => ({ admin: vi.fn() }));

type FakeDbOptions = { forceCollisionOnce?: boolean };

function fakeDb({ forceCollisionOnce = false }: FakeDbOptions = {}) {
  const attempts: string[] = [];
  let collisionPending = forceCollisionOnce;

  const db = {
    from(table: string) {
      if (table === "communities") {
        return {
          select() {
            return {
              eq() {
                return { maybeSingle: async () => ({ data: null, error: null }) };
              },
            };
          },
          insert() {
            return {
              select() {
                return {
                  single: async () => ({
                    data: { id: "community-1", slug: "test-community", admin_token: "community-token" },
                    error: null,
                  }),
                };
              },
            };
          },
        };
      }

      return {
        insert(row: { slug: string }) {
          attempts.push(row.slug);
          return {
            select() {
              return {
                single: async () => {
                  if (collisionPending) {
                    collisionPending = false;
                    return { data: null, error: { code: "23505", message: "duplicate event slug" } };
                  }
                  return { data: { slug: row.slug, admin_token: "event-token" }, error: null };
                },
              };
            },
          };
        },
      };
    },
  };

  return { db, attempts };
}

function request(name = "Test Night") {
  return new Request("https://convene.test/api/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
}

describe("event slug hardening", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses 48 bits of lowercase hex entropy and retries a unique slug collision", async () => {
    const { db, attempts } = fakeDb({ forceCollisionOnce: true });
    vi.mocked(admin).mockReturnValue(db as unknown as ReturnType<typeof admin>);

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).not.toBe(attempts[1]);
    expect(attempts[1]).toMatch(/^test-night-[a-f0-9]{12}$/);
    expect(body.slug).toBe(attempts[1]);
  });

  it("generates 10,000 unique event slugs", async () => {
    const generated: string[] = [];
    const db = {
      from(table: string) {
        if (table === "communities") {
          return {
            select() {
              return {
                eq() {
                  return { maybeSingle: async () => ({ data: null, error: null }) };
                },
              };
            },
            insert() {
              return {
                select() {
                  return {
                    single: async () => ({
                      data: { id: "community-1", slug: "test-community", admin_token: "community-token" },
                      error: null,
                    }),
                  };
                },
              };
            },
          };
        }

        return {
          insert(row: { slug: string }) {
            generated.push(row.slug);
            return {
              select() {
                return {
                  single: async () => ({ data: { slug: row.slug, admin_token: "event-token" }, error: null }),
                };
              },
            };
          },
        };
      },
    };
    vi.mocked(admin).mockReturnValue(db as unknown as ReturnType<typeof admin>);

    for (let index = 0; index < 10_000; index += 1) {
      const response = await POST(request(`Test Night ${index}`));
      expect(response.status).toBe(200);
    }

    expect(new Set(generated).size).toBe(10_000);
    expect(generated.every((slug) => /^test-night(?:-\d+)?-[a-f0-9]{12}$/.test(slug))).toBe(true);
  });
});
