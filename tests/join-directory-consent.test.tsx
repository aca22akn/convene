// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { JoinForm } from "@/components/JoinForm";

const next = () => fireEvent.click(screen.getByRole("button", { name: /^next/i }));

function fillStepOne() {
  fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Priya Raman" } });
  fireEvent.change(screen.getByRole("textbox", { name: /what are you building/i }), {
    target: { value: "Building a useful tool and looking for design feedback" },
  });
}

/** Walks the stepper to the final "Your choices" step. */
function goToChoices() {
  fillStepOne();
  next();
  next();
  expect(screen.getByRole("heading", { name: "Your choices" })).toBeTruthy();
}

describe("JoinForm stepped flow", () => {
  beforeEach(() => {
    cleanup();
    push.mockReset();
    localStorage.clear();
    window.scrollTo = vi.fn();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("shows visible progress and only the current step's fields", () => {
    render(<JoinForm slug="demo" />);
    expect(screen.getByText("Step 1 of 3")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Your line" })).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: /x handle/i })).toBeNull();

    fillStepOne();
    next();
    expect(screen.getByText("Step 2 of 3")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: /x handle/i })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: /happy to speak on/i })).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Name" })).toBeNull();
  });

  it("moves focus to the new step heading and keeps earlier answers when going back", () => {
    render(<JoinForm slug="demo" />);
    fillStepOne();
    next();
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "A little more" }));

    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect((screen.getByRole("textbox", { name: "Name" }) as HTMLInputElement).value).toBe("Priya Raman");
  });

  it("validates instantly and blocks Next until the required line is written", () => {
    render(<JoinForm slug="demo" />);
    next();
    expect(screen.getByText("Enter your name.")).toBeTruthy();
    expect(screen.getByText(/write at least a few words/i)).toBeTruthy();
    expect(screen.getByText("Step 1 of 3")).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Name" }).getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Name" }));
  });

  it("checks the X handle against the server's rule before moving on", () => {
    render(<JoinForm slug="demo" />);
    fillStepOne();
    next();
    fireEvent.change(screen.getByRole("textbox", { name: /x handle/i }), { target: { value: "not a handle!" } });
    next();
    expect(screen.getByText(/letters, numbers and underscores, up to 15/i)).toBeTruthy();
    expect(screen.getByText("Step 2 of 3")).toBeTruthy();
  });

  it("sends directory consent separately from contact consent", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ member_id: "member-1", extraction: "keywords" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<JoinForm slug="demo" aiEnabled />);
    goToChoices();
    expect(screen.getByText(/name, x handle, event line, talk topic, and the number of events where you opted in/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: /show me in the community directory/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /keep my text away from external ai/i }));
    fireEvent.click(screen.getByRole("button", { name: /find my intros/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(requestBody).toMatchObject({ directory_consent: true, contact_consent: false, ai_opt_out: true });
    expect(push).toHaveBeenCalledWith(expect.stringContaining("/e/demo/me?id=member-1"));
  });

  it("makes contact sharing its own plain-language choice that needs a contact before sending", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ member_id: "member-2" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<JoinForm slug="demo" />);
    goToChoices();

    const group = screen.getByRole("group", { name: /contact sharing/i });
    expect(within(group).getByText(/only the organiser receives it, and only if you tick this/i)).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: /phone or email/i })).toBeNull();

    fireEvent.click(within(group).getByRole("checkbox", { name: /share my contact with the organiser/i }));
    fireEvent.click(screen.getByRole("button", { name: /find my intros/i }));
    expect(screen.getByText(/add a phone number or email, or untick this/i)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole("textbox", { name: /phone or email/i }), { target: { value: "priya@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /find my intros/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({ contact: "priya@example.com", contact_consent: true });
  });

  it("keeps the full privacy notice one tap away, verbatim", () => {
    render(<JoinForm slug="demo" retentionDays={90} />);
    goToChoices();
    const notice = screen.getByRole("list", { name: "Privacy notice" });
    expect(notice.textContent).toContain("Event data is retained for 90 days, then deleted automatically.");
    expect(notice.textContent).toContain("Contact details are shared with the organiser only if you consent.");
  });

  it("shows a clear room-full state from the join endpoint and keeps what was written", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ error: "room_full" }), { status: 409 })));
    render(<JoinForm slug="demo" />);
    goToChoices();
    fireEvent.click(screen.getByRole("button", { name: /find my intros/i }));
    expect((await screen.findByRole("alert")).textContent).toContain("This room is full");
    expect(screen.getByRole("button", { name: /find my intros/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect((screen.getByRole("textbox", { name: "Name" }) as HTMLInputElement).value).toBe("Priya Raman");
  });

  it("explains a network failure in plain words", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(new TypeError("Failed to fetch")));
    render(<JoinForm slug="demo" />);
    goToChoices();
    fireEvent.click(screen.getByRole("button", { name: /find my intros/i }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/couldn’t reach convene.*still here/i);
  });

  it("says so when the phone is offline", () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    render(<JoinForm slug="demo" />);
    expect(screen.getByText("You’re offline")).toBeTruthy();
    vi.restoreAllMocks();
  });

  it("shows that the doors are closed without rendering the form", () => {
    render(<JoinForm slug="demo" joiningClosed />);
    expect(screen.getByRole("status").textContent).toContain("The doors are closed");
    expect(screen.queryByRole("textbox", { name: "Name" })).toBeNull();
    expect(screen.queryByRole("button", { name: /find my intros/i })).toBeNull();
  });

  it("shows a not-found state instead of a form that can never succeed", () => {
    render(<JoinForm slug="gone" notFound />);
    expect(screen.getByRole("status").textContent).toContain("We couldn’t find this event");
    expect(screen.queryByRole("textbox", { name: "Name" })).toBeNull();
  });

  it("names the event being joined", () => {
    render(<JoinForm slug="demo" eventName="Agents Night #12" />);
    expect(screen.getByText("Agents Night #12")).toBeTruthy();
  });

  it("marks optional fields with contrast-safe text", () => {
    render(<JoinForm slug="demo" />);
    fillStepOne();
    next();
    const optional = screen.getAllByText("(optional)");
    expect(optional).toHaveLength(2);
    expect(optional.every((element) => element.classList.contains("text-fg-2"))).toBe(true);
  });
});
