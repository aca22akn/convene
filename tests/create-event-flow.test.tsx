// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { CreateEvent } from "@/components/CreateEvent";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CreateEvent flow", () => {
  it("validates the name instantly and does not call the API while it is invalid", () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    render(<CreateEvent aiAvailable={false} />);
    const field = screen.getByRole("textbox", { name: "Event name" });

    fireEvent.change(field, { target: { value: "a" } });
    fireEvent.click(screen.getByRole("button", { name: /create event/i }));

    expect(screen.getByText("Use at least 2 characters.")).toBeTruthy();
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(field.getAttribute("aria-describedby")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("tucks community fields behind a disclosure that reports its state", () => {
    render(<CreateEvent aiAvailable={false} />);
    expect(screen.queryByRole("textbox", { name: /existing community slug/i })).toBeNull();

    const toggle = screen.getByRole("button", { name: /community options/i });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("textbox", { name: /new community name/i })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: /existing community slug/i }).getAttribute("maxlength")).toBe("40");
  });

  it("shows ordered next steps with the organiser link, stage link, join link and a QR code", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ slug: "agents-night", admin_token: "SECRET-TOKEN", community_slug: "agents", community_token: "COMM-TOKEN" }), { status: 200 }),
    ));
    render(<CreateEvent aiAvailable={false} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Event name" }), { target: { value: "Agents Night" } });
    fireEvent.click(screen.getByRole("button", { name: /create event/i }));

    const steps = await screen.findByRole("heading", { name: "Your event is ready" });
    expect(document.activeElement).toBe(steps);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(within(items[0]).getByRole("heading", { name: /save your organiser link/i })).toBeTruthy();
    expect((within(items[0]).getByRole("textbox", { name: /organiser link/i }) as HTMLInputElement).value).toMatch(/\/e\/agents-night\/organiser#t=SECRET-TOKEN$/);
    expect((within(items[0]).getByRole("textbox", { name: /community token/i }) as HTMLInputElement).value).toBe("COMM-TOKEN");
    expect(within(items[1]).getByRole("link", { name: /open stage/i }).getAttribute("href")).toMatch(/\/e\/agents-night\/stage$/);
    expect((within(items[2]).getByRole("textbox", { name: "Join link" }) as HTMLInputElement).value).toMatch(/\/e\/agents-night$/);
    expect(within(items[2]).getByRole("img", { name: "QR code to join Agents Night" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /copy join link/i })).toBeTruthy();
  });

  it("explains an existing community and opens the options when the API asks for its token", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ error: "community exists: pass its admin token as community_token" }), { status: 403 }),
    ));
    render(<CreateEvent aiAvailable={false} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Event name" }), { target: { value: "Agents Night" } });
    fireEvent.click(screen.getByRole("button", { name: /create event/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/already exists/i);
    await waitFor(() => expect(screen.getByRole("textbox", { name: /existing community token/i })).toBeTruthy());
  });
});
