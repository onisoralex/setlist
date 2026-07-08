import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound } from "@/lib/api-response";
import { buildOverrideUpdate, InvalidOverrideValueError } from "@/lib/track-list";

type RouteParams = { params: Promise<{ id: string; trackListSongId: string }> };

// PATCH /api/events/:id/songs/:trackListSongId/overrides -- set/clear per-event field
// overrides. Tri-state semantics per spec §2/§6: a field absent from the body is untouched,
// present as null clears the override, present as a string (including "") sets it. See
// lib/track-list.ts buildOverrideUpdate for how the tri-state distinction is preserved
// through JSON parsing.
export const PATCH = async (request: NextRequest, { params }: RouteParams) => {
  const { id: eventId, trackListSongId } = await params;
  const body = await request.json();

  const row = await prisma.trackListSong.findUnique({ where: { id: trackListSongId } });
  if (!row || row.eventId !== eventId) {
    return notFound(`Track list song ${trackListSongId} not found on event ${eventId}`);
  }

  let update;
  try {
    update = buildOverrideUpdate(body);
  } catch (error) {
    if (error instanceof InvalidOverrideValueError) {
      return badRequest(error.message);
    }
    throw error;
  }

  const updated = await prisma.trackListSong.update({
    where: { id: trackListSongId },
    data: update,
  });

  return NextResponse.json(updated);
};
