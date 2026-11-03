import { clearSessionCookie, originMatches, revokeSession } from "@/lib/auth";

export async function POST(req: Request) {
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
