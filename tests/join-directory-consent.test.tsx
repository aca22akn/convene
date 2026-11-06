// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { JoinForm } from "@/components/JoinForm";

describe("JoinForm directory consent", () => {
  beforeEach(() => {
    cleanup();
    push.mockReset();
    localStorage.clear();
  });

  it("sends directory consent separately from contact consent", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ member_id: "member-1", extraction: "keywords" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<JoinForm slug="demo" aiEnabled />);
    expect(screen.getByText(/name, x handle, event line, talk topic, and the number of events where you opted in/i)).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Priya Raman" } });
    fireEvent.change(screen.getByRole("textbox", { name: /what are you building/i }), {
      target: { value: "Building a useful tool and looking for design feedback" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /show me in the community directory/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /keep my text away from external ai/i }));
    fireEvent.click(screen.getByRole("button", { name: /find my people/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(requestBody).toMatchObject({ directory_consent: true, contact_consent: false, ai_opt_out: true });
    expect(push).toHaveBeenCalledWith(expect.stringContaining("/e/demo/me?id=member-1"));
  });

  it("shows a clear room-full state from the join endpoint", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ error: "room_full" }), { status: 409 }),
    ));
    render(<JoinForm slug="demo" />);
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Priya Raman" } });
    fireEvent.change(screen.getByRole("textbox", { name: /what are you building/i }), {
      target: { value: "Building a useful tool and looking for design feedback" },
    });
    fireEvent.click(screen.getByRole("button", { name: /find my people/i }));
    expect((await screen.findByRole("alert")).textContent).toContain("This room is full");
  });

  it("shows that the doors are closed without rendering the join form", () => {
    render(<JoinForm slug="demo" joiningClosed />);
    expect(screen.getByRole("status").textContent).toContain("The doors are closed");
    expect(screen.queryByRole("textbox", { name: "Name" })).toBeNull();
    expect(screen.queryByRole("button", { name: /find my people/i })).toBeNull();
  });
});
