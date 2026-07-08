import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound } from "@/lib/api-response";

type RouteParams = { params: Promise<{ id: string }> };

// PATCH /api/events/:id/archive -- the delete affordance for events (spec §6). No hard-delete
// endpoint exists for events, matching the same rationale as songs (see
// app/api/songs/[groupId]/archive/route.ts).
export const PATCH = async (request: NextRequest, { params }: RouteParams) => {
  const { id } = await params;
  const body = await request.json();

  if (typeof body.archived !== "boolean") {
    return badRequest("archived must be a boolean");
  }

  try {
    const event = await prisma.event.update({
      where: { id },
      data: { archived: body.archived },
    });
    return NextResponse.json(event);
  } catch {
    return notFound(`Event ${id} not found`);
  }
};
