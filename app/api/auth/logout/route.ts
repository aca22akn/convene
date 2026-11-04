import { clearSessionCookie, originMatches, revokeSession } from "@/lib/auth";
import { envLimit, limit } from "@/lib/ratelimit";

export async function POST(req: Request) {
  const limited = await limit(req, "auth-exchange-ip", { limit: envLimit("AUTH_EXCHANGE_LIMIT", 10), windowSeconds: 600 });
  if (limited) return limited;
  if (!originMatches(req)) return Response.json({ error: "origin mismatch" }, { status: 403 });
  await revokeSession(req);
  return new Response(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store",
      "Set-Cookie": clearSessionCookie(),
    },
  });
}
