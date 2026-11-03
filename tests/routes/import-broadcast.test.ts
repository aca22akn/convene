import { beforeEach, describe, expect, it, vi } from "vitest";

const { authorizeEventRequest, bad, getEvent, insertMembers, json, notifyEvent, parseLumaCsv, personKey, recompute } = vi.hoisted(() => ({
  authorizeEventRequest: vi.fn(),
  bad: vi.fn((message: string, status = 400) => Response.json({ error: message }, { status })),
  getEvent: vi.fn(),
  insertMembers: vi.fn(),
  json: vi.fn((body: unknown, status = 200) => Response.json(body, { status })),
  notifyEvent: vi.fn(),
  parseLumaCsv: vi.fn(),
  personKey: vi.fn(),
  recompute: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ authorizeEventRequest }));
vi.mock("@/lib/api", () => ({ bad, getEvent, json }));
vi.mock("@/lib/intake", () => ({ insertMembers }));
vi.mock("@/lib/luma", () => ({ parseLumaCsv }));
vi.mock("@/lib/people", () => ({ personKey }));
vi.mock("@/lib/realtime", () => ({ notifyEvent }));
vi.mock("@/lib/recompute", () => ({ recompute }));

import { POST } from "@/app/api/e/[slug]/import/route";

const event = { id: "event-1", slug: "demo", community_id: "community-1" };

describe("POST /api/e/[slug]/import broadcasts committed members", () => {
  beforeEach(() => {
    authorizeEventRequest.mockReset().mockResolvedValue({ status: 200 });
    bad.mockClear();
    getEvent.mockReset().mockResolvedValue(event);
    insertMembers.mockReset().mockResolvedValue(["member-1"]);
    json.mockClear();
    notifyEvent.mockReset().mockResolvedValue(undefined);
    parseLumaCsv.mockReset().mockReturnValue({ guests: [{ name: "Ada", line: "Building a useful analytics engine", contact_consent: false }], lineColumn: "What are you building?", speakColumn: null });
    personKey.mockReset().mockReturnValue("person-key");
    recompute.mockReset().mockResolvedValue([]);
  });

  it("notifies the event after successful member import", async () => {
    const response = await POST(
      new Request("http://localhost/api/e/demo/import", { method: "POST", body: "Name,Question\nAda,Building an analytics engine" }),
      { params: Promise.resolve({ slug: "demo" }) },
    );

    expect(response.status).toBe(200);
    expect(insertMembers).toHaveBeenCalledOnce();
    expect(notifyEvent).toHaveBeenCalledOnce();
    expect(notifyEvent).toHaveBeenCalledWith(event.id);
  });
});
