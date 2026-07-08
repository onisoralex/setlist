import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound } from "@/lib/api-response";

type RouteParams = { params: Promise<{ id: string }> };

// POST /api/events/:id/songs -- add an entry to an event's tracklist. Two shapes:
//   - { entryType: "spacer" }: an independent, reorderable "blank line" entry (spec §1) --
//     no song fields, appended like any other row.
//   - { songGroupId }: add a song by song_group_id (default when entryType is omitted).
//     Resolves to that group's *current* version at add-time and snapshots it into
//     track_list_song.song_id (spec §2) -- later "change everywhere" edits may auto-bump this
//     snapshot per §3.1, but only while the event stays eligible (draft/scheduled and unlocked).
export const POST = async (request: NextRequest, { params }: RouteParams) => {
  const { id: eventId } = await params;
  const body = await request.json();

  const isSpacer = body.entryType === "spacer";

  if (!isSpacer && typeof body.songGroupId !== "string") {
    return badRequest("songGroupId is required");
  }

  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) {
    return notFound(`Event ${eventId} not found`);
  }

  let currentVersion = null;
  if (!isSpacer) {
    currentVersion = await prisma.song.findFirst({
      where: { songGroupId: body.songGroupId },
      orderBy: { version: "desc" },
    });
    if (!currentVersion) {
      return notFound(`Song group ${body.songGroupId} not found`);
    }
  }

  const trackListSong = await prisma.$transaction(async (tx) => {
    // Positions are 0-based and contiguous per event (unique on event_id, position) --
    // appending means "one past whatever the highest position currently is".
    const lastRow = await tx.trackListSong.findFirst({
      where: { eventId },
      orderBy: { position: "desc" },
    });
    const nextPosition = lastRow ? lastRow.position + 1 : 0;

    return tx.trackListSong.create({
      data: isSpacer
        ? {
            eventId,
            entryType: "spacer",
            songGroupId: null,
            songId: null,
            position: nextPosition,
          }
        : {
            eventId,
            entryType: "song",
            songGroupId: body.songGroupId,
            songId: currentVersion!.id,
            position: nextPosition,
          },
    });
  });

  return NextResponse.json(trackListSong, { status: 201 });
};
