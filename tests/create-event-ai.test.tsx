// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { CreateEvent } from "@/components/CreateEvent";

describe("CreateEvent AI setting", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("defaults the event AI setting from server availability and sends the organiser choice", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ slug: "new-event" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CreateEvent aiAvailable />);
    const aiToggle = screen.getByRole("checkbox", { name: /use xai for matching and ask/i });
    expect((aiToggle as HTMLInputElement).checked).toBe(true);
    fireEvent.change(screen.getByPlaceholderText(/event name/i), { target: { value: "Demo night" } });
    fireEvent.click(screen.getByRole("button", { name: /create event/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({ name: "Demo night", ai_enabled: true });
  });

  it("keeps AI disabled and locked when no xAI key is available", () => {
    render(<CreateEvent aiAvailable={false} />);
    const aiToggle = screen.getByRole("checkbox", { name: /use xai for matching and ask/i });
    expect((aiToggle as HTMLInputElement).checked).toBe(false);
    expect((aiToggle as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(/unavailable until XAI_API_KEY is configured/i)).toBeTruthy();
  });
});
