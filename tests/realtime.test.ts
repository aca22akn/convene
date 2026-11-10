import { beforeEach, describe, expect, it, vi } from "vitest";

const { admin } = vi.hoisted(() => ({ admin: vi.fn() }));
vi.mock("@/lib/db", () => ({ admin }));

import { notifyEvent } from "@/lib/realtime";

describe("notifyEvent", () => {
  const channel = { httpSend: vi.fn() };
  const client = { channel: vi.fn(), removeChannel: vi.fn() };

  beforeEach(() => {
    channel.httpSend.mockReset().mockResolvedValue({ success: true });
    client.channel.mockReset().mockReturnValue(channel);
    client.removeChannel.mockReset().mockResolvedValue("ok");
    admin.mockReset().mockReturnValue(client);
  });

  it("sends a private REST broadcast with no profile data and removes the channel", async () => {
    await notifyEvent("event-123");

    expect(client.channel).toHaveBeenCalledWith("event:event-123", { config: { private: true } });
    expect(channel.httpSend).toHaveBeenCalledWith("changed", {});
    expect(client.removeChannel).toHaveBeenCalledWith(channel);
  });

  it("removes the channel when the REST send fails", async () => {
    channel.httpSend.mockRejectedValueOnce(new Error("Realtime unavailable"));

    await expect(notifyEvent("event-123")).rejects.toThrow("Realtime unavailable");
    expect(client.removeChannel).toHaveBeenCalledWith(channel);
  });
});
