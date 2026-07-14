import { NextRequest, NextResponse } from "next/server";
import { createAuthToken } from "@/lib/auth";
import { jsonError } from "@/lib/api-response";

const AUTH_COOKIE_NAME = "setlist_auth";
const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 90; // 90 days

export const POST = async (request: NextRequest) => {
  const body = await request.json();
  const password = typeof body.password === "string" ? body.password : "";

  // Direct comparison of the submitted password against the env var -- this is the one-time
  // login check, not the recurring cookie check in middleware.ts (which uses isValidAuthToken).
  if (password === "" || password !== process.env.SITE_PASSWORD) {
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
