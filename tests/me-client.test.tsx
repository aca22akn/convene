// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const { useLive } = vi.hoisted(() => ({ useLive: vi.fn() }));
vi.mock("@/lib/useLive", () => ({ useLive }));

import { MeClient } from "@/components/MeClient";

const refetch = vi.fn();

function renderMatches() {
  return render(<MeClient slug="demo" id="member-1" mock={false} />);
}

afterEach(() => {
  cleanup();
  refetch.mockReset();
  useLive.mockReset();
});

describe("MeClient states", () => {
  it("shows a loading status before the member view arrives", () => {
    useLive.mockReturnValue({ data: null, error: null, refetch });
    renderMatches();

    expect(screen.getByRole("status", { name: "Loading matches" })).toBeTruthy();
    expect(screen.queryByText(/no introductions yet/i)).toBeNull();
  });

  it("explains a loaded empty state and whether the room is still small", () => {
    useLive.mockReturnValue({
      data: {
        event: { id: "event-1", member_count: 1 },
        member: { id: "member-1", name: "Priya Raman", line: "Building a useful thing" },
        matches: [],
      },
      error: null,
      refetch,
    });
    renderMatches();

    expect(screen.getByText(/no introductions yet/i)).toBeTruthy();
    expect(screen.getByText(/this is still a small room/i)).toBeTruthy();
    expect(screen.queryByRole("status", { name: "Loading matches" })).toBeNull();
  });

  it("shows an error with a retry control when loading fails", () => {
    useLive.mockReturnValue({ data: null, error: "Network unavailable", refetch });
    renderMatches();

    expect(screen.getByRole("alert").textContent).toContain("Network unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledOnce();
  });
});
