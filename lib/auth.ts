// Shared-password auth for this app (see CLAUDE.md and docs/architecture.md "Auth" for why
// this is deliberately minimal -- one password, no real user accounts).
//
// The auth cookie's value is a deterministic HMAC-SHA256 of a fixed string, keyed by
// SITE_PASSWORD. It doesn't encode an expiry itself -- validity is entirely "does recomputing
// the HMAC with the current SITE_PASSWORD match this token", so rotating SITE_PASSWORD
// invalidates every existing cookie at once. The cookie's own Max-Age is the other half of
// expiry (see app/api/auth/login/route.ts).
//
// Uses the Web Crypto API (`crypto.subtle`) rather than `node:crypto` because this runs from
// middleware.ts, which may execute on the Edge runtime -- `crypto.subtle` is the one crypto
// API that's guaranteed available in both Edge and Node. Same reasoning for avoiding `Buffer`
// below in favor of a manual hex conversion.

const AUTH_TOKEN_MESSAGE = "setlist-auth";

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
