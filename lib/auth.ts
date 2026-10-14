// Shared-password auth for this app (see CLAUDE.md and docs/architecture.md "Auth" for why
// this is deliberately minimal -- one password, no real user accounts).
//
// The auth cookie's value is a deterministic HMAC-SHA256 of a fixed string, keyed by
// SITE_PASSWORD. It doesn't encode an expiry itself -- validity is entirely "does recomputing
// the HMAC with the current SITE_PASSWORD match this token", so rotating SITE_PASSWORD
// invalidates every existing cookie at once. The cookie's own Max-Age is the other half of
// expiry: set to 90 days at login (app/api/auth/login/route.ts) and re-set to a fresh 90 days
// by proxy.ts on every authenticated page load, so the expiry is sliding -- the login only
// lapses after 90 days without opening the app, not 90 days after the original login.
//
// Uses the Web Crypto API (`crypto.subtle`) rather than `node:crypto` because this runs from
// proxy.ts, which historically ran on the Edge runtime (Next's Proxy convention now defaults
// to Node.js, but `crypto.subtle` is available as a Node global too, so this still works
// unchanged either way) -- `crypto.subtle` is the one crypto API guaranteed available in both.
// Same reasoning for avoiding `Buffer` below in favor of a manual hex conversion.

const AUTH_TOKEN_MESSAGE = "setlist-auth";

export const AUTH_COOKIE_NAME = "setlist_auth";
export const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 90; // 90 days

// Single source of the cookie's attributes for every place that sets it (login, logout, and the
// sliding renewal in proxy.ts). A browser treats a Set-Cookie with a different path/secure/
// sameSite as a *separate* cookie or ignores it, so the renewal and the logout's clear only
// work if they match the login's attributes exactly -- hence one helper instead of three copies.
export const authCookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge,
  path: "/",
});

const toHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, "0")).join("");

const signMessage = async (secret: string): Promise<string> => {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(AUTH_TOKEN_MESSAGE));
  return toHex(signature);
};

export const createAuthToken = async (secret: string): Promise<string> => signMessage(secret);

export const isValidAuthToken = async (token: string, secret: string): Promise<boolean> => {
  if (!token) return false;
  const expected = await signMessage(secret);
  // Plain string comparison is fine here -- this app's threat model is crawlers/casual
  // access, not a targeted attacker defeating a timing side-channel over HTTPS.
  return token === expected;
};
