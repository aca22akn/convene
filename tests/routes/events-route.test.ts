import { beforeEach, describe, expect, it, vi } from "vitest";

const { admin } = vi.hoisted(() => ({ admin: vi.fn() }));

vi.mock("@/lib/db", () => ({ admin }));

import { POST } from "@/app/api/events/route";

describe("POST /api/events", () => {
  beforeEach(() => {
    admin.mockReset();
  });

  it("rejects an invalid event name before accessing the database", async () => {
    const response = await POST(
      new Request("http://localhost/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "x" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid input" });
    expect(admin).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON before accessing the database", async () => {
    const response = await POST(
      new Request("http://localhost/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid input" });
    expect(admin).not.toHaveBeenCalled();
  });
});
