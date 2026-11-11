// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const intros = Array.from({ length: 5 }, (_, index) => ({
  a_id: `a-${index}`,
  b_id: `b-${index}`,
  created_at: `2026-11-06T19:0${index}:00Z`,
  headline: `A deliberately long introduction headline ${index} that must wrap cleanly without becoming unreachable in the stage panel.`,
}));
const members = Array.from({ length: 10 }, (_, index) => ({ id: index % 2 === 0 ? `a-${index / 2}` : `b-${Math.floor(index / 2)}`, display_name: `Member ${index}` }));

const { live } = vi.hoisted(() => ({ live: vi.fn() }));
vi.mock("@/lib/useLive", () => ({ useLive: live }));
vi.mock("qrcode.react", () => ({ QRCodeSVG: ({ "aria-label": label }: { "aria-label"?: string }) => <svg role="img" aria-label={label} /> }));

import { StageClient } from "@/components/StageClient";

const view = { event: { id: "event-1", name: "Overflow sample", slug: "overflow" }, count: 10, members, intros };

afterEach(() => {
  cleanup();
  live.mockReset();
});

describe("StageClient", () => {
  it("features the newest intro, quoting it, with first names only", () => {
    live.mockReturnValue({ data: view, error: null });
    render(<StageClient slug="overflow" mock={false} />);

    const latest = screen.getByRole("article", { name: "Latest intro" });
    expect(latest.textContent).toContain("Member 8");
    expect(latest.textContent).toContain("Member 9");
    expect(latest.textContent).toContain("headline 4");
  });

  it("shows two earlier intros without a scroll container, and keeps every intro reachable in a keyboard list", () => {
    live.mockReturnValue({ data: view, error: null });
    render(<StageClient slug="overflow" mock={false} />);

    const earlier = screen.getByRole("list", { name: "Earlier intros" });
    expect(within(earlier).getAllByRole("listitem")).toHaveLength(2);
    expect(earlier.textContent).toContain("headline 3");
    expect(screen.queryByRole("list", { name: "Introduction list" })).toBeNull();

    const toggle = screen.getByRole("button", { name: "All intros (5)" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(toggle);

    const all = screen.getByRole("list", { name: "Introduction list" });
    expect(within(all).getAllByRole("listitem")).toHaveLength(5);
    expect(all.className).toMatch(/overflow-y-auto/);
    expect(all.getAttribute("tabindex")).toBe("0");
    fireEvent.keyDown(all, { key: "Escape" });
    expect(screen.queryByRole("list", { name: "Introduction list" })).toBeNull();
  });

  it("lists who is here, newest first, with the head count", () => {
    live.mockReturnValue({ data: view, error: null });
    render(<StageClient slug="overflow" mock={false} />);

    const roster = within(screen.getByRole("list", { name: "Who’s here" })).getAllByRole("listitem");
    expect(roster).toHaveLength(10);
    expect(roster[0].textContent).toBe("Member 9");
    expect(screen.getByText("here · 5 intros")).toBeTruthy();
  });

  it("names the join QR code and supplies a text join link", () => {
    live.mockReturnValue({ data: view, error: null });
    render(<StageClient slug="overflow" mock={false} />);

    expect(screen.getByRole("img", { name: "QR code to join Overflow sample" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /localhost:3000\/e\/overflow/i }).getAttribute("href")).toBe("http://localhost:3000/e/overflow");
  });

  it("explains what to do before the first intro, and says when it is reconnecting", () => {
    live.mockReturnValue({ data: { ...view, count: 0, members: [], intros: [] }, error: "HTTP 503" });
    render(<StageClient slug="overflow" mock={false} />);

    expect(screen.getByText("Intros appear here as people join.")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Reconnecting");
    expect(screen.queryByRole("button", { name: /all intros/i })).toBeNull();
  });
});
