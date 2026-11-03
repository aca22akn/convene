import { admin } from "./db";

/** Notify clients watching an event without publishing member or intro rows. */
export async function notifyEvent(eventId: string): Promise<void> {
  const db = admin();
  const channel = db.channel(`event:${eventId}`, { config: { private: true } });

  try {
    const result = await channel.httpSend("changed", {});
    if (!result.success) throw new Error(`Realtime broadcast failed: ${result.error}`);
  } finally {
    await db.removeChannel(channel);
  }
}
