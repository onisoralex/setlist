import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, locked, notFound } from "@/lib/api-response";
import { commitTracklistBatch, InvalidOverrideValueError, resolveTrackListEntry } from "@/lib/track-list";
import type { TracklistBatchEntry } from "@/lib/types";

type RouteParams = { params: Promise<{ id: string }> };

// PUT /api/events/:id/tracklist -- batch-commits TracklistEditModal's full local edit buffer in
// one request (spec tracklist-batch-save-spec §2): the caller declares the complete desired
// ordered tracklist, and this route diffs it against the DB and writes creates/deletes/
// reorders/override-patches in one prisma.$transaction (see lib/track-list.ts
// commitTracklistBatch). Replaces the four separate immediate-effect routes the editor used to
// call one at a time -- POST .../songs, DELETE .../songs/:id, PATCH .../songs/reorder, PATCH
// .../songs/:id/overrides -- all deleted alongside this route. PUT (not PATCH) because the body
// is the full desired tracklist, not a partial patch.
export const PUT = async (request: NextRequest, { params }: RouteParams) => {
  const { id: eventId } = await params;
  const body = await request.json();

  if (!Array.isArray(body.entries)) {
    return badRequest("entries must be an array");
  }

  for (const raw of body.entries) {
    if (typeof raw !== "object" || raw === null) {
      return badRequest("each entry must be an object");
    }
    if (raw.kind !== "song" && raw.kind !== "spacer") {
      return badRequest('each entry\'s kind must be "song" or "spacer"');
    }
    if (raw.id !== null && typeof raw.id !== "string") {
      return badRequest("each entry's id must be a string or null");
    }
    if (raw.kind === "song" && typeof raw.songGroupId !== "string") {
      return badRequest("songGroupId is required for song entries");
    }
  }

  // Shape-checked above -- safe to treat as the typed request shape from here on.
  const entries: TracklistBatchEntry[] = body.entries;

  const nonNullIds = entries.map((entry) => entry.id).filter((id): id is string => id !== null);
  if (new Set(nonNullIds).size !== nonNullIds.length) {
    return badRequest("duplicate entry id");
  }

  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) {
    return notFound(`Event ${eventId} not found`);
  }

  // Spec §2.6 Option B, per the Mind/user decision: a played or manually-locked event's
  // tracklist can no longer be batch-committed. None of the four routes this endpoint replaces
  // enforced this (pre-existing gap in the app, not introduced here) -- paired with a
  // client-side guard (app/events/[id]/page.tsx's "Edit Tracklist" button and
  // app/events/[id]/edit/page.tsx) so this is surfaced before the user invests time editing,
  // not only discovered via a failed commit.
  if (event.status === "played" || event.lockedAt !== null) {
    return locked(`Event ${eventId} is played or locked -- its tracklist can no longer be edited`);
  }

  const existingRows = await prisma.trackListSong.findMany({ where: { eventId } });
  const existingById = new Map(existingRows.map((row) => [row.id, row]));

  for (const entry of entries) {
    if (entry.id === null) continue;
    const row = existingById.get(entry.id);
    if (!row) {
      return notFound(`Track list song ${entry.id} not found on event ${eventId}`);
    }
    if (row.entryType !== entry.kind) {
      return badRequest(`Track list song ${entry.id} cannot change type from ${row.entryType} to ${entry.kind}`);
    }
    if (entry.kind === "song" && row.songGroupId !== entry.songGroupId) {
      return badRequest("songGroupId does not match existing track list song's song group");
    }
  }

  // Resolve the current version for every newly-added song entry up front (same lookup the old
  // POST .../songs route did), so a bad songGroupId fails cheap before the transaction opens,
  // and commitTracklistBatch doesn't need to re-query it.
  const newSongGroupIds = [
    ...new Set(
      entries
        .filter((entry): entry is Extract<TracklistBatchEntry, { kind: "song" }> => entry.kind === "song" && entry.id === null)
        .map((entry) => entry.songGroupId),
    ),
  ];
  const resolvedCurrentVersionId = new Map<string, string>();
  for (const songGroupId of newSongGroupIds) {
    const currentVersion = await prisma.song.findFirst({
      where: { songGroupId },
      orderBy: { version: "desc" },
    });
    if (!currentVersion) {
      return notFound(`Song group ${songGroupId} not found`);
    }
    resolvedCurrentVersionId.set(songGroupId, currentVersion.id);
  }

  try {
    await prisma.$transaction((tx) => commitTracklistBatch(tx, eventId, entries, resolvedCurrentVersionId));
  } catch (error) {
    if (error instanceof InvalidOverrideValueError) {
      return badRequest(error.message);
    }
    throw error;
  }

  const updatedEvent = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      trackListSongs: {
        orderBy: { position: "asc" },
        include: { song: { include: { songGroup: true } } },
      },
    },
  });

  if (!updatedEvent) {
    return notFound(`Event ${eventId} not found`);
  }

  const { trackListSongs, ...eventFields } = updatedEvent;
  return NextResponse.json({
    ...eventFields,
    songs: trackListSongs.map((row) => resolveTrackListEntry(row, row.song)),
  });
};
