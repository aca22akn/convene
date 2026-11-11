// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const { useLive } = vi.hoisted(() => ({ useLive: vi.fn() }));
vi.mock("@/lib/useLive", () => ({ useLive }));
vi.mock("@/components/Graph", () => ({ Graph: () => <div data-testid="room-map" /> }));

import { OrganiserClient } from "@/components/OrganiserClient";
import { mockOrganiser } from "@/lib/mocks";

const refetch = vi.fn();

afterEach(() => {
  cleanup();
  useLive.mockReset();
  vi.unstubAllGlobals();
});

function renderDashboard(data = mockOrganiser, error: string | null = null) {
  useLive.mockReturnValue({ data, error, refetch });
  return render(<OrganiserClient slug="demo" mock={false} />);
}

describe("organiser dashboard", () => {
  it("puts copyable join and stage links next to the joining control", () => {
    renderDashboard();
    expect((screen.getByRole("textbox", { name: /join link/i }) as HTMLInputElement).value).toMatch(/\/e\/demo$/);
    expect((screen.getByRole("textbox", { name: /stage/i }) as HTMLInputElement).value).toMatch(/\/e\/demo\/stage$/);
    expect(screen.getByRole("button", { name: /copy join link/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /copy stage link/i })).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Close joining" }).getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText("Joining is open")).toBeTruthy();
  });

  it("searches members and flags speaker candidates and shared contacts", () => {
    renderDashboard();
    const list = screen.getByRole("list", { name: "Members" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(5);
    const tom = within(list).getByText("Tom Okafor").closest("li") as HTMLElement;
    expect(within(tom).getByText("Speaker candidate")).toBeTruthy();
    const priya = within(list).getByText("Priya Raman").closest("li") as HTMLElement;
    expect(within(priya).getByText("Shared contact")).toBeTruthy();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search members" }), { target: { value: "clinical" } });
    const filtered = within(screen.getByRole("list", { name: "Members" })).getAllByRole("listitem");
    expect(filtered.map((li) => li.querySelector("p")?.textContent)).toEqual(["Dr Amara Mensah", "James Whitfield"]);
    expect(screen.getByText("2 of 5 match")).toBeTruthy();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search members" }), { target: { value: "zzz" } });
    expect(screen.getByText("No members match “zzz”.")).toBeTruthy();
  });

  it("says how many contacts the opted-in export holds, and disables it when nobody opted in", () => {
    renderDashboard();
    expect(screen.getByRole("link", { name: /contacts \(3 opted in\)/i }).getAttribute("href")).toBe("/api/e/demo/export/contacts.vcf");
    cleanup();

    renderDashboard({ ...mockOrganiser, members: mockOrganiser.members.map((m) => ({ ...m, contact_consent: false })) });
    expect(screen.queryByRole("link", { name: /contacts/i })).toBeNull();
    expect(screen.getByText(/nobody opted in yet/i).closest("[aria-disabled]")?.getAttribute("aria-disabled")).toBe("true");
  });

  it("shows a real empty state before anyone joins", () => {
    renderDashboard({ ...mockOrganiser, members: [], intros: [], speakers: [], needs: {}, offers: {}, unmet: [] });
    expect(screen.getByText(/nobody has joined yet/i)).toBeTruthy();
    expect(screen.getByText(/no speaker candidates yet/i)).toBeTruthy();
  });

  it("keeps the last data on screen with a warning when a refresh fails", () => {
    renderDashboard(mockOrganiser, "HTTP 503");
    expect(screen.getByText(/can’t refresh right now/i)).toBeTruthy();
    expect(screen.getByRole("list", { name: "Members" })).toBeTruthy();
  });

  it("confirms before deleting: the button stays disabled until the word is typed, then the event is gone", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    renderDashboard();

    fireEvent.click(screen.getByRole("button", { name: /delete everything…/i }));
    const dialog = screen.getByRole("dialog", { name: /delete “sample event”\?/i });
    const confirm = within(dialog).getByRole("button", { name: "Delete everything" });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(within(dialog).getByRole("textbox", { name: /type “delete” to confirm/i }), { target: { value: "delete" } });
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(confirm);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/e/demo", { method: "DELETE" }));
    expect(await screen.findByRole("heading", { name: "Event deleted" })).toBeTruthy();
  });

  it("shows a loading state, not the token form, while the first request is in flight", () => {
    useLive.mockReturnValue({ data: null, error: null, refetch });
    render(<OrganiserClient slug="demo" mock={false} />);
    expect(screen.getByRole("status", { name: /opening the organiser dashboard/i })).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Organiser token" })).toBeNull();
  });

  it("shows the token form when the session is missing", () => {
    useLive.mockReturnValue({ data: null, error: "unauthorised", refetch });
    render(<OrganiserClient slug="demo" mock={false} />);
    expect(screen.getByRole("textbox", { name: "Organiser token" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe("unauthorised");
  });
});
