// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/useLive", () => ({
  useLive: () => ({
    data: {
      community: { name: "Makers" },
      total: 1,
      people: [{ name: "Priya Raman", latest_line: "Building tools", events_count: 1 }],
    },
    error: null,
  }),
}));

import { DirectoryClient } from "@/components/DirectoryClient";

describe("directory opt-in copy", () => {
  it("explains that members appear only after opting in", () => {
    render(<DirectoryClient slug="makers" mock={false} />);
    expect(screen.getByText(/only members who opt in appear in this directory/i)).toBeTruthy();
  });
});
