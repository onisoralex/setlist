import { NextRequest, NextResponse } from "next/server";
import { isValidAuthToken } from "@/lib/auth";

// Gate the whole app behind the single shared password (see lib/auth.ts). This is the only
// auth this app has -- see CLAUDE.md.
const AUTH_COOKIE_NAME = "setlist_auth";

export const middleware = async (request: NextRequest) => {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const valid = token ? await isValidAuthToken(token, process.env.SITE_PASSWORD ?? "") : false;

  if (valid) {
    return NextResponse.next();
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
