import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notFound } from "@/lib/api-response";

type RouteParams = { params: Promise<{ id: string; trackListSongId: string }> };

// DELETE /api/events/:id/songs/:trackListSongId -- remove a song from an event's tracklist.
// The one genuine hard delete in this system (spec §6): it only removes the join row, never
// the song or event, so it doesn't touch history. Re-numbers remaining positions so the
// (event_id, position) unique constraint and 0-based contiguous ordering both hold.
export const DELETE = async (_request: NextRequest, { params }: RouteParams) => {
  const { id: eventId, trackListSongId } = await params;

  const result = await prisma.$transaction(async (tx) => {
    const row = await tx.trackListSong.findUnique({ where: { id: trackListSongId } });
    if (!row || row.eventId !== eventId) {
      return null;
    }

    await tx.trackListSong.delete({ where: { id: trackListSongId } });

    // Shift every row after the deleted position down by one. Done as individual updates
    // (not a single UPDATE ... SET position = position - 1) because that single-statement
    // form could momentarily violate the (event_id, position) unique constraint depending on
    // update order; per-row updates in position order are safe since each target slot is
    // freed before it's filled.
    const remaining = await tx.trackListSong.findMany({
      where: { eventId, position: { gt: row.position } },
      orderBy: { position: "asc" },
    });
    for (const remainingRow of remaining) {
      await tx.trackListSong.update({
        where: { id: remainingRow.id },
        data: { position: remainingRow.position - 1 },
      });
    }

    return row;
  });

  if (!result) {
    return notFound(`Track list song ${trackListSongId} not found on event ${eventId}`);
  }

  return new NextResponse(null, { status: 204 });
};
