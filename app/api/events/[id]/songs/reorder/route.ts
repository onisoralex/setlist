import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound } from "@/lib/api-response";

type RouteParams = { params: Promise<{ id: string }> };

// PATCH /api/events/:id/songs/reorder -- bulk reorder. Body: ordered array of
// trackListSongIds; rewrites position for all of them in one transaction.
export const PATCH = async (request: NextRequest, { params }: RouteParams) => {
  const { id: eventId } = await params;
  const body = await request.json();

  if (!Array.isArray(body.trackListSongIds) || body.trackListSongIds.some((v: unknown) => typeof v !== "string")) {
    return badRequest("trackListSongIds must be an array of strings");
  }

  const trackListSongIds: string[] = body.trackListSongIds;

  const existing = await prisma.trackListSong.findMany({ where: { eventId } });
  if (existing.length !== trackListSongIds.length || !existing.every((row) => trackListSongIds.includes(row.id))) {
    return badRequest("trackListSongIds must be exactly the set of track list song ids currently on this event");
  }

  await prisma.$transaction(async (tx) => {
    // Two-pass write to dodge the (event_id, position) unique constraint: writing final
    // positions directly in one pass can collide with another row's current position before
    // that row has been moved. Parking everything at a negative offset first guarantees no
    // collision is possible in either pass, since negative positions never overlap with the
    // real 0-based range.
    await Promise.all(
      trackListSongIds.map((rowId, index) =>
        tx.trackListSong.update({ where: { id: rowId }, data: { position: -(index + 1) } }),
      ),
    );
    await Promise.all(
      trackListSongIds.map((rowId, index) => tx.trackListSong.update({ where: { id: rowId }, data: { position: index } })),
    );
  });

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { trackListSongs: { orderBy: { position: "asc" } } },
  });

  if (!event) {
    return notFound(`Event ${eventId} not found`);
  }

  return NextResponse.json(event.trackListSongs);
};
