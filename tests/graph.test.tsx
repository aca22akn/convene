// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("next/dynamic", () => ({ default: () => () => <canvas data-testid="force-graph" /> }));

import { Graph } from "@/components/Graph";

afterEach(() => cleanup());

describe("Graph text alternative", () => {
  it("summarises the canvas and reveals every introduction in a proper list", () => {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    render(
      <Graph
        members={[
          { id: "a", display_name: "Ada" },
          { id: "b", display_name: "Ben" },
          { id: "c", display_name: "Chen" },
        ]}
        intros={[
          { a_id: "a", b_id: "b", created_at: "2026-11-06T19:00:00Z", headline: "Shared experience with Postgres" },
          { a_id: "a", b_id: "c", created_at: "2026-11-06T19:01:00Z", headline: "Both are building health tools" },
        ]}
      />,
    );

    expect(screen.getByRole("img", { name: "3 people, 2 introductions" })).toBeTruthy();
    const list = screen.getByRole("list", { name: "Introduction list" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(list.textContent).toContain("Ada ↔ Ben · Shared experience with Postgres");

    const toggle = screen.getByRole("button", { name: "List view" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(list.className).not.toMatch(/sr-only/);
  });
});
