import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound } from "@/lib/api-response";

type RouteParams = { params: Promise<{ id: string }> };

// PATCH /api/events/:id/lock -- set locked_at to now, or null to unlock (spec §3.2). This is
// independent of status: a not-yet-played event can be locked early if it's already been
// rehearsed from, which status alone can't express.
export const PATCH = async (request: NextRequest, { params }: RouteParams) => {
  const { id } = await params;
  const body = await request.json();

  if (!("locked" in body) || typeof body.locked !== "boolean") {
    return badRequest("locked must be a boolean");
  }

  try {
    const event = await prisma.event.update({
      where: { id },
      data: { lockedAt: body.locked ? new Date() : null },
    });
    return NextResponse.json(event);
  } catch {
    return notFound(`Event ${id} not found`);
  }
};
