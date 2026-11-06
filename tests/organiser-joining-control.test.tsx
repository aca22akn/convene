// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const { useLive } = vi.hoisted(() => ({ useLive: vi.fn() }));
vi.mock("@/lib/useLive", () => ({ useLive }));

import { OrganiserClient } from "@/components/OrganiserClient";

describe("organiser joining control", () => {
  afterEach(() => {
    cleanup();
    useLive.mockReset();
  });

  it("uses a labelled switch to show that joining is closed", () => {
    useLive.mockReturnValue({
      data: {
        event: { name: "Demo night", slug: "demo", joins_closed: true },
        members: [],
        intros: [],
        needs: {},
        offers: {},
        unmet: [],
        speakers: [],
      },
      error: null,
      refetch: vi.fn(),
    });

    render(<OrganiserClient slug="demo" mock={false} />);
    const control = screen.getByRole("switch", { name: "Close joining" });
    expect(control.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText(/the doors are closed/i)).toBeTruthy();
  });
});
