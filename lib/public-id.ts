import { createHmac } from "node:crypto";

const DEV_PUBLIC_ID_SECRET = "convene-dev-public-id-secret";

/** Stable pseudonymous ID for a live graph node, scoped to one event. */
export function opaqueLiveMemberId(eventId: string, memberId: string): string {
  const configuredSecret = process.env.PUBLIC_ID_SECRET?.trim();
  const secret = configuredSecret || (process.env.NODE_ENV === "production" ? undefined : DEV_PUBLIC_ID_SECRET);
  if (!secret) throw new Error("Missing required PUBLIC_ID_SECRET");
  return createHmac("sha256", secret)
    .update(`convene-live-member-id:v1:${eventId}:${memberId}`)
    .digest("base64url");
}
