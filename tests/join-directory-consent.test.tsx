// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { JoinForm } from "@/components/JoinForm";

describe("JoinForm directory consent", () => {
  beforeEach(() => {
    push.mockReset();
    localStorage.clear();
  });

  it("sends directory consent separately from contact consent", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ member_id: "member-1", extraction: "keywords" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<JoinForm slug="demo" />);
    expect(screen.getByText(/name, x handle, event line, talk topic, and the number of events where you opted in/i)).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Priya Raman" } });
    fireEvent.change(screen.getByRole("textbox", { name: /what are you building/i }), {
      target: { value: "Building a useful tool and looking for design feedback" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /show me in the community directory/i }));
    fireEvent.click(screen.getByRole("button", { name: /find my people/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(requestBody).toMatchObject({ directory_consent: true, contact_consent: false });
    expect(push).toHaveBeenCalledWith(expect.stringContaining("/e/demo/me?id=member-1"));
  });
});
