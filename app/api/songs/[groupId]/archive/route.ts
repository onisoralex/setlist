import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound } from "@/lib/api-response";

type RouteParams = { params: Promise<{ groupId: string }> };

// PATCH /api/songs/:groupId/archive -- the delete affordance for songs (spec §6). There is
// no hard-delete endpoint: a song_group referenced by a past event's track_list_song row
// would either cascade-destroy history or fail on the RESTRICT FK, so archiving (a plain
// visibility flag) is the only removal path.
export const PATCH = async (request: NextRequest, { params }: RouteParams) => {
  const { groupId } = await params;
  const body = await request.json();

  if (typeof body.archived !== "boolean") {
    return badRequest("archived must be a boolean");
  }

  try {
    const group = await prisma.songGroup.update({
      where: { id: groupId },
      data: { archived: body.archived },
    });
    return NextResponse.json(group);
  } catch {
    return notFound(`Song group ${groupId} not found`);
  }
};
