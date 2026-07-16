import { NextRequest, NextResponse } from "next/server";
import { createAuthToken } from "@/lib/auth";
import { jsonError, tooManyRequests } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";

const AUTH_COOKIE_NAME = "setlist_auth";
const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 90; // 90 days

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX_ATTEMPTS = 5;

// Vercel's edge sets x-forwarded-for to "client, proxy1, proxy2, ..." -- the first entry is
// the original client. x-real-ip is a fallback for setups that only set that header. In local
// dev (no proxy in front) neither header exists, so every request collapses onto one "unknown"
// bucket -- fine for dev, since there's only ever one real client hitting it at a time.
const getClientIp = (request: NextRequest): string => {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  return request.headers.get("x-real-ip") ?? "unknown";
};

export const POST = async (request: NextRequest) => {
  const body = await request.json();
  const password = typeof body.password === "string" ? body.password : "";
  const ipAddress = getClientIp(request);
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);

  // Self-pruning: delete expired rows before counting so the table never grows unbounded and
  // we never count attempts outside the window. No cron job needed.
  await prisma.loginAttempt.deleteMany({
    where: { createdAt: { lt: windowStart } },
  });

  const recentFailures = await prisma.loginAttempt.count({
    where: { ipAddress, succeeded: false, createdAt: { gte: windowStart } },
  });

  if (recentFailures >= RATE_LIMIT_MAX_ATTEMPTS) {
    // Cap applies before the password is even checked -- a correct password during an active
    // lockout must not be let through.
    return tooManyRequests("Too many login attempts. Try again in a few minutes.");
  }

  // Direct comparison of the submitted password against the env var -- this is the one-time
  // login check, not the recurring cookie check in middleware.ts (which uses isValidAuthToken).
  // The explicit "" check guards against a misconfigured/unset SITE_PASSWORD ("") letting a
  // blank submitted password through.
  const succeeded = password !== "" && password === process.env.SITE_PASSWORD;

  await prisma.loginAttempt.create({
    data: { ipAddress, succeeded },
  });

  if (!succeeded) {
    return jsonError("Incorrect password", 401);
  }

  const token = await createAuthToken(process.env.SITE_PASSWORD ?? "");
  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: AUTH_COOKIE_MAX_AGE_SECONDS,
    path: "/",
  });
  return response;
};
