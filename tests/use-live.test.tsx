// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const { browser } = vi.hoisted(() => ({ browser: vi.fn() }));
vi.mock("@/lib/db", () => ({ browser }));

import { useLive } from "@/lib/useLive";

describe("useLive event broadcasts", () => {
  let channel: { on: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn> };
  let broadcast: (() => void) | undefined;
  let subscriptionStatus: ((status: string) => void) | undefined;
  let removeChannel: ReturnType<typeof vi.fn>;
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

  beforeEach(() => {
    broadcast = undefined;
    subscriptionStatus = undefined;
    channel = {
      on: vi.fn((_type: string, _filter: { event: string }, callback: () => void) => {
        broadcast = callback;
        return channel;
      }),
      subscribe: vi.fn((callback?: (status: string) => void) => {
        subscriptionStatus = callback;
        return channel;
      }),
    };
    removeChannel = vi.fn(async () => "ok");
    browser.mockReset().mockReturnValue({
      channel: vi.fn(() => channel),
      removeChannel,
    });
    fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify({ version: 1 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("subscribes to a private event topic and refetches on changed broadcasts", async () => {
    const { result, unmount } = renderHook(() => useLive<{ version: number }>("/api/live", { eventId: "event-1", intervalMs: 60_000 }));

    await waitFor(() => expect(result.current.data).toEqual({ version: 1 }));
    const client = browser.mock.results[0]?.value;
    expect(client.channel).toHaveBeenCalledWith("event:event-1", { config: { private: true, broadcast: { self: false } } });
    expect(channel.on).toHaveBeenCalledWith("broadcast", { event: "changed" }, expect.any(Function));

    await act(async () => {
      broadcast?.();
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    unmount();
    expect(removeChannel).toHaveBeenCalledWith(channel);
  });

  it("keeps the same data reference when a refetch returns unchanged JSON", async () => {
    const { result, unmount } = renderHook(() => useLive<{ version: number }>("/api/live", { eventId: "event-1", intervalMs: 60_000 }));
    await waitFor(() => expect(result.current.data).toEqual({ version: 1 }));
    const initialData = result.current.data;

    await act(async () => {
      broadcast?.();
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    expect(result.current.data).toBe(initialData);
    unmount();
  });

  it("stops fallback polling while subscribed and resumes with jitter after the channel drops", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const { result, unmount } = renderHook(() => useLive<{ version: number }>("/api/live", { eventId: "event-1", intervalMs: 10_000 }));

    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.data).toEqual({ version: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(channel.subscribe).toHaveBeenCalledWith(expect.any(Function));

    await act(async () => { subscriptionStatus?.("SUBSCRIBED"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => { subscriptionStatus?.("CLOSED"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(9_499); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    unmount();
  });

  it("does not poll while hidden and sends the last ETag on a 304-safe refetch", async () => {
    vi.useFakeTimers();
    const firstEtag = '"v1"';
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ version: 1 }), { headers: { ETag: firstEtag } }))
      .mockResolvedValueOnce(new Response(null, { status: 304, headers: { ETag: firstEtag } }));
    let renderCount = 0;
    const { result, unmount } = renderHook(() => {
      renderCount += 1;
      return useLive<{ version: number }>("/api/live", { eventId: "event-1", intervalMs: 10_000 });
    });

    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const originalData = result.current.data;
    expect(originalData).toEqual({ version: 1 });

    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    const renderCountBefore304 = renderCount;
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ headers: { "If-None-Match": firstEtag } });
    expect(result.current.data).toBe(originalData);
    expect(result.current.error).toBeNull();
    expect(renderCount).toBe(renderCountBefore304);
    unmount();
  });
});
