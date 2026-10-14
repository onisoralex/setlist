import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_MAX_AGE_SECONDS, AUTH_COOKIE_NAME, authCookieOptions, isValidAuthToken } from "@/lib/auth";

// Gate the whole app behind the single shared password (see lib/auth.ts). This is the only
// auth this app has -- see CLAUDE.md.

// Sliding expiry: renew the cookie only on page loads, not on every proxied request.
// - /api/* is excluded because /api/auth/logout passes through here with a valid cookie; a
//   renewal Set-Cookie from the proxy would land on the same response as the route's own
//   "clear" Set-Cookie, and which one the browser keeps depends on header order -- logout must
//   never be able to race a renewal. Every API call happens from an already-loaded page anyway,
//   so skipping them loses nothing.
// - Only GET, since a page load/client-side navigation is always a GET; Server Action POSTs to
//   page paths don't need to renew (the page they run on already did).
// One Set-Cookie per navigation is plenty for a 90-day window.
const shouldRenewAuthCookie = (request: NextRequest): boolean =>
  request.method === "GET" && !request.nextUrl.pathname.startsWith("/api/");

export const proxy = async (request: NextRequest) => {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const valid = token ? await isValidAuthToken(token, process.env.SITE_PASSWORD ?? "") : false;

  if (valid) {
    const response = NextResponse.next();
    if (token && shouldRenewAuthCookie(request)) {
      // The token is deterministic (HMAC of a fixed message), so re-issuing the same value with
      // a fresh Max-Age is the whole renewal -- no new token needed.
      response.cookies.set(AUTH_COOKIE_NAME, token, authCookieOptions(AUTH_COOKIE_MAX_AGE_SECONDS));
    }
    return response;
  }

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  return NextResponse.redirect(loginUrl);
};

// Excludes /login and /api/auth/login (handled by the matcher, not by logic above) so there's
// no redirect loop, plus Next.js internals/static assets so the login page itself can load.
export const config = {
  matcher: [
    "/((?!login|api/auth/login|_next/static|_next/image|favicon.ico).*)",
  ],
};
