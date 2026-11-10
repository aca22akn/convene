import { bad } from "@/lib/api";
import { resolveAdminToken, storeAccessToken, SESSION_TTL_SECONDS, makeSessionCookie, originMatches, validReturnPath } from "@/lib/auth";
import { envLimit, limit } from "@/lib/ratelimit";
import { readLimitedText } from "@/lib/request-body";

type ExchangeInput = { token?: unknown; return_to?: unknown };

export async function POST(req: Request) {
  const limited = await limit(req, "auth-exchange-ip", { limit: envLimit("AUTH_EXCHANGE_LIMIT", 10), windowSeconds: 600 });
  if (limited) return limited;
  const contentType = req.headers.get("content-type") ?? "";
  const raw = await readLimitedText(req, 4 * 1024);
  if (!raw.ok) return bad(raw.error, raw.status);
  let body: ExchangeInput;
  let browserForm = false;
  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const formRequest = new Request(req.url, { method: "POST", headers: req.headers, body: raw.value });
    const form = await formRequest.formData().catch(() => null);
    if (!form) return bad("invalid input");
    body = { token: form.get("token"), return_to: form.get("return_to") };
    browserForm = true;
  } else {
    let value: unknown;
    try { value = JSON.parse(raw.value); } catch { return bad("invalid input"); }
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !["token", "return_to"].includes(key))) return bad("invalid input");
    body = value as ExchangeInput;
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
