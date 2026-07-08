import { NextResponse } from "next/server";

// Small shared helpers so every route handler reports errors the same shape
// (`{ error: string }`) instead of each one improvising its own JSON body.
export const jsonError = (message: string, status: number) =>
  NextResponse.json({ error: message }, { status });

export const notFound = (message: string) => jsonError(message, 404);
export const badRequest = (message: string) => jsonError(message, 400);
