// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const { useLive, fetchMock } = vi.hoisted(() => ({ useLive: vi.fn(), fetchMock: vi.fn() }));
vi.mock("@/lib/useLive", () => ({ useLive }));

import { DirectoryClient } from "@/components/DirectoryClient";

const cursor = "2026-11-01T12:00:00.000Z|00000000-0000-4000-8000-000000000050";
const pagePerson = (index: number) => ({
  name: `Member ${String(index).padStart(3, "0")}`,
  latest_line: `Building project ${index}`,
  events_count: 1,
});

describe("directory pagination", () => {
  beforeEach(() => {
    useLive.mockReset().mockReturnValue({
      data: { community: { name: "Makers" }, total: 51, people: Array.from({ length: 50 }, (_, index) => pagePerson(index)), next_cursor: cursor },
      error: null,
    });
    fetchMock.mockReset().mockResolvedValue(new Response(JSON.stringify({
      community: { name: "Makers" },
      total: 51,
      people: [pagePerson(50)],
      next_cursor: null,
    }), { headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("loads the next database cursor page and appends it without duplicates", async () => {
    render(<DirectoryClient slug="makers" mock={false} />);

    fireEvent.click(screen.getByRole("button", { name: /load more/i }));

    expect(await screen.findByText("Member 050")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(51);
    expect(fetchMock).toHaveBeenCalledWith(`/api/c/makers?cursor=${encodeURIComponent(cursor)}`, expect.objectContaining({ method: "GET" }));
  });
});
