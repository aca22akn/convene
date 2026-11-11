// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const { useLive } = vi.hoisted(() => ({ useLive: vi.fn() }));
vi.mock("@/lib/useLive", () => ({ useLive }));

import { MeClient } from "@/components/MeClient";

const refetch = vi.fn();

function renderMatches(justJoined = false) {
  return render(<MeClient slug="demo" id="member-1" mock={false} justJoined={justJoined} />);
}

const member = { id: "member-1", name: "Priya Raman", line: "Building a carbon API, need a Postgres engineer" };
const withMatches = {
  event: { id: "event-1", member_count: 5 },
  member,
  matches: [
    {
      member: { id: "m2", name: "Tom Okafor", line: "Building a sharding tool, need real users to stress-test it", x_handle: "tomok" },
      reasons: [
        { text: "Priya needs Postgres help and Tom builds it", quote: "need a Postgres engineer", grounded: true },
        { text: "Tom wants real workloads", quote: "need real users to stress-test it", grounded: true },
      ],
    },
    {
      member: { id: "m3", name: "Sofia Marchetti", line: "Climate seed fund", x_handle: null },
      reasons: [{ text: "Both work on climate", quote: null, grounded: false }],
    },
  ],
};

afterEach(() => {
  cleanup();
  refetch.mockReset();
  useLive.mockReset();
});

describe("MeClient states", () => {
  it("shows a loading status before the member view arrives", () => {
    useLive.mockReturnValue({ data: null, error: null, refetch });
    renderMatches();

    expect(screen.getByRole("status", { name: "Loading your intros" })).toBeTruthy();
    expect(screen.queryByText(/no intros yet/i)).toBeNull();
  });

  it("is honest right after joining: says what is happening and how long it takes, not a fake progress bar", () => {
    useLive.mockReturnValue({ data: { event: { id: "e", member_count: 4 }, member, matches: [] }, error: null, refetch });
    renderMatches(true);

    const status = screen.getByRole("status", { name: "Loading your intros" });
    expect(within(status).getByText("Finding your intros")).toBeTruthy();
    expect(status.textContent).toMatch(/comparing it with everyone who’s here/i);
    expect(status.textContent).toMatch(/about 10 seconds/i);
    expect(screen.queryByText(/no intros yet/i)).toBeNull();
  });

  it("admits when finding intros is taking longer than usual, then falls back to the empty state", () => {
    vi.useFakeTimers();
    try {
      useLive.mockReturnValue({ data: { event: { id: "e", member_count: 4 }, member, matches: [] }, error: null, refetch });
      renderMatches(true);
      expect(screen.queryByText(/taking longer than usual/i)).toBeNull();

      act(() => { vi.advanceTimersByTime(20_000); });
      expect(screen.queryByText(/no intros yet/i)).toBeTruthy();
      expect(screen.queryByRole("status", { name: "Loading your intros" })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("makes the reasons the star: each quote says whose words it is", () => {
    useLive.mockReturnValue({ data: withMatches, error: null, refetch });
    renderMatches();

    expect(screen.getByRole("heading", { name: "Your intros" })).toBeTruthy();
    expect(screen.getByText("Intro 1 of 2")).toBeTruthy();
    const tom = screen.getByRole("heading", { name: "Tom Okafor" }).closest("article") as HTMLElement;
    expect(within(tom).getByText("Why you two")).toBeTruthy();
    expect(within(tom).getByText("You wrote this")).toBeTruthy();
    expect(within(tom).getByText("Tom wrote this")).toBeTruthy();
    expect(tom.querySelectorAll("mark")).toHaveLength(2);
    expect(within(tom).getByRole("link", { name: /find tom on x: @tomok/i }).getAttribute("href")).toBe("https://x.com/tomok");

    const sofia = screen.getByRole("heading", { name: "Sofia Marchetti" }).closest("article") as HTMLElement;
    expect(sofia.querySelectorAll("mark")).toHaveLength(0);
    expect(screen.getByText(/find tom and sofia in the room/i)).toBeTruthy();
  });

  it("keeps showing the last intros, with a warning, when a refresh fails", () => {
    useLive.mockReturnValue({ data: withMatches, error: "Network unavailable", refetch });
    renderMatches();

    expect(screen.getByText("Can’t refresh right now")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Tom Okafor" })).toBeTruthy();
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

    expect(screen.getByText(/no intros yet/i)).toBeTruthy();
    expect(screen.getByText(/this is still a small room/i)).toBeTruthy();
    expect(screen.queryByRole("status", { name: "Loading your intros" })).toBeNull();
  });

  it("shows an error with a retry control when loading fails", () => {
    useLive.mockReturnValue({ data: null, error: "Network unavailable", refetch });
    renderMatches();

    expect(screen.getByRole("alert").textContent).toContain("Network unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledOnce();
  });
});
