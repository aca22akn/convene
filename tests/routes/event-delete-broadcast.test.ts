import { beforeEach, describe, expect, it, vi } from "vitest";

const { admin, authorizeEventRequest, getEvent, notifyEvent } = vi.hoisted(() => ({
  admin: vi.fn(),
  authorizeEventRequest: vi.fn(),
  getEvent: vi.fn(),
  notifyEvent: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ admin }));
vi.mock("@/lib/auth", () => ({ authorizeEventRequest }));
vi.mock("@/lib/api", () => ({
  bad: (message: string, status = 400) => Response.json({ error: message }, { status }),
  getEvent,
  json: (body: unknown, status = 200) => Response.json(body, { status }),
}));
vi.mock("@/lib/realtime", () => ({ notifyEvent }));

import { DELETE } from "@/app/api/e/[slug]/route";

describe("DELETE /api/e/[slug] broadcasts successful deletions", () => {
  beforeEach(() => {
    getEvent.mockReset().mockResolvedValue({ id: "event-1", slug: "demo", community_id: null });
    authorizeEventRequest.mockReset().mockResolvedValue({ auth: {}, status: 200 });
    notifyEvent.mockReset().mockResolvedValue(undefined);
    admin.mockReset().mockReturnValue({
      from: (table: string) => {
        if (table === "members") {
          return {
            select: () => ({
              eq: async () => ({ data: [{ person_id: "person-1" }], error: null }),
              in: async () => ({ data: [], error: null }),
            }),
          };
        }
        if (table === "events") return { delete: () => ({ eq: async () => ({ error: null }) }) };
        if (table === "people") return { delete: () => ({ in: async () => ({ error: null }) }) };
        throw new Error(`Unexpected table ${table}`);
      },
    });
  });

  it("notifies the deleted event after the database delete succeeds", async () => {
    const response = await DELETE(
      new Request("https://convene.example/api/e/demo", { method: "DELETE", headers: { authorization: "Bearer event-token" } }),
      { params: Promise.resolve({ slug: "demo" }) },
    );

    expect(response.status).toBe(200);
    expect(notifyEvent).toHaveBeenCalledOnce();
    expect(notifyEvent).toHaveBeenCalledWith("event-1");
  });
});
