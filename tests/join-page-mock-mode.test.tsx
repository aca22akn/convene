import { beforeEach, describe, expect, it, vi } from "vitest";

const { getEvent } = vi.hoisted(() => ({ getEvent: vi.fn() }));
vi.mock("@/lib/api", () => ({ getEvent }));

import JoinPage from "@/app/e/[slug]/page";

describe("event join page mock mode", () => {
  beforeEach(() => getEvent.mockReset());

  it("does not look up the event in Supabase when mock mode is enabled", async () => {
    const page = await JoinPage({
      params: Promise.resolve({ slug: "demo" }),
      searchParams: Promise.resolve({ mock: "1" }),
    });

    expect(getEvent).not.toHaveBeenCalled();
    expect(page.props).toMatchObject({ slug: "demo", aiEnabled: false, joiningClosed: false });
  });
});
