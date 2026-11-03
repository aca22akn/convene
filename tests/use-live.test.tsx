// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const { browser } = vi.hoisted(() => ({ browser: vi.fn() }));
vi.mock("@/lib/db", () => ({ browser }));

import { useLive } from "@/lib/useLive";

describe("useLive event broadcasts", () => {
  let channel: { on: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn> };
  let broadcast: (() => void) | undefined;
  let removeChannel: ReturnType<typeof vi.fn>;
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

  beforeEach(() => {
    broadcast = undefined;
    channel = {
      on: vi.fn((_type: string, _filter: { event: string }, callback: () => void) => {
        broadcast = callback;
        return channel;
      }),
      subscribe: vi.fn(() => channel),
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
    const { result } = renderHook(() => useLive<{ version: number }>("/api/live", { eventId: "event-1", intervalMs: 60_000 }));
    await waitFor(() => expect(result.current.data).toEqual({ version: 1 }));
    const initialData = result.current.data;

    await act(async () => {
      broadcast?.();
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    expect(result.current.data).toBe(initialData);
  });
});
