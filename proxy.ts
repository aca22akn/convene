import { NextResponse, type NextRequest } from "next/server";

export function connectSources() {
  const sources = new Set(["'self'"]);
  if (process.env.NODE_ENV === "development") {
    sources.add("http://localhost:54321");
    sources.add("ws://localhost:54321");
    sources.add("http://127.0.0.1:54321");
    sources.add("ws://127.0.0.1:54321");
  }
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (projectUrl) {
    try {
      const origin = new URL(projectUrl).origin;
      sources.add(origin);
      sources.add(origin.replace(/^http/, "ws"));
    } catch {
      // An invalid or unset URL is handled by the existing database configuration checks.
    }
  }

  return [...sources].join(" ");
}

const nextRouteAnnouncerStyleHashes = [
  // Chromium's CSP reports for Next 16's app-router-announcer CSSStyleDeclaration writes.
  "'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='",
  "'sha256-9xjtvxMT1ApHlgn9ohbh2FNfvK5Tqtzy94BjfXBeMSY='",
  "'sha256-jtRRMYY2VbEXuBKbHvqM1/fPT8vazFrEooXdvwUK4y8='",
];

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}' 'unsafe-hashes' ${nextRouteAnnouncerStyleHashes.join(" ")}`,
    "img-src 'self' blob: data:",
    "font-src 'self' data:",
    `connect-src ${connectSources()}`,
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
