// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

const intros = Array.from({ length: 5 }, (_, index) => ({
  a_id: `a-${index}`,
  b_id: `b-${index}`,
  created_at: `2026-11-06T19:0${index}:00Z`,
  headline: `A deliberately long introduction headline ${index} that must wrap cleanly without becoming unreachable in the stage panel.`,
}));

vi.mock("@/lib/useLive", () => ({
  useLive: () => ({
    data: {
      event: { id: "event-1", name: "Overflow demo", slug: "overflow" },
      count: 10,
      members: Array.from({ length: 10 }, (_, index) => ({ id: index % 2 === 0 ? `a-${index / 2}` : `b-${Math.floor(index / 2)}`, display_name: `Member ${index}` })),
      intros,
    },
    error: null,
  }),
}));
vi.mock("qrcode.react", () => ({ QRCodeSVG: ({ "aria-label": label }: { "aria-label"?: string }) => <svg role="img" aria-label={label} /> }));
vi.mock("@/components/Graph", () => ({ Graph: () => <div aria-label="Introduction graph" /> }));

import { StageClient } from "@/components/StageClient";

afterEach(() => cleanup());

describe("StageClient latest introductions", () => {
  it("keeps every overflowed introduction in a labelled, scrollable list and announces how many continue below", () => {
    render(<StageClient slug="overflow" mock={false} />);

    const list = screen.getByRole("list", { name: "Latest introductions" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByText("2 more below")).toBeTruthy();
    expect(list.className).toMatch(/overflow-y-auto/);
    expect(list.getAttribute("tabindex")).toBe("0");
  });

  it("names the join QR code and supplies a text join link", () => {
    render(<StageClient slug="overflow" mock={false} />);

    expect(screen.getByRole("img", { name: "QR code to join Overflow demo" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /localhost:3000\/e\/overflow/i }).getAttribute("href")).toBe("http://localhost:3000/e/overflow");
  });
});
