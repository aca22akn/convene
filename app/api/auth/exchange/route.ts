import { bad } from "@/lib/api";
import { resolveAdminToken, storeAccessToken, SESSION_TTL_SECONDS, makeSessionCookie, originMatches, validReturnPath } from "@/lib/auth";

type ExchangeInput = { token?: unknown; return_to?: unknown };

export async function POST(req: Request) {
  const contentType = req.headers.get("content-type") ?? "";
  let body: ExchangeInput;
  let browserForm = false;
  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    if (!form) return bad("invalid input");
    body = { token: form.get("token"), return_to: form.get("return_to") };
    browserForm = true;
  } else {
    body = await req.json().catch(() => ({}));
  }

  if (!originMatches(req)) return bad("origin mismatch", 403);
  if (typeof body.token !== "string" || body.token.length < 1 || body.token.length > 512) return bad("invalid input");
  const identity = await resolveAdminToken(body.token);
  if (!identity) return bad("unauthorized", 401);

  const session = await storeAccessToken(identity.scope, "session", SESSION_TTL_SECONDS);
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Set-Cookie": makeSessionCookie(session),
  });
  if (browserForm) {
    const returnTo = validReturnPath(typeof body.return_to === "string" ? body.return_to : null) ?? "/";
    headers.set("Location", returnTo);
    return new Response(null, { status: 303, headers });
  }
  return Response.json({ authenticated: true }, { status: 200, headers });
}
