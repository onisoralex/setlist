import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound } from "@/lib/api-response";
import { bumpSongVersion, SongGroupNotFoundError } from "@/lib/song-versioning";

type RouteParams = { params: Promise<{ groupId: string }> };

// GET /api/songs/:groupId -- current version's full detail + past version list for history.
export const GET = async (_request: NextRequest, { params }: RouteParams) => {
  const { groupId } = await params;

  const group = await prisma.songGroup.findUnique({
    where: { id: groupId },
    include: { songs: { orderBy: { version: "desc" } } },
  });

  if (!group || group.songs.length === 0) {
    return notFound(`Song group ${groupId} not found`);
  }

  const [current, ...history] = group.songs;

  return NextResponse.json({
    id: group.id,
    archived: group.archived,
    title: group.title,
    titleDe: group.titleDe,
    titleEn: group.titleEn,
    key: current.key,
    transpose: current.transpose,
    instrument: current.instrument,
    notes: current.notes,
    sheet: current.sheet,
    version: current.version,
    versions: [current, ...history].map((song) => ({
      id: song.id,
      version: song.version,
      createdAt: song.createdAt,
    })),
  });
};

// PATCH /api/songs/:groupId -- "change everywhere going forward" (spec §3.1). Only fields
// present in the body are changed; omitted fields carry forward from the current version.
// `title` is not versioned data (it lives on song_group), so it's routed to a separate
// songGroup.update rather than through bumpSongVersion. If only `title` is present, that's the
// only write that happens -- no new song version at all. Both writes (when both are present)
// run inside one transaction so a request touching both can't leave things half-applied.
export const PATCH = async (request: NextRequest, { params }: RouteParams) => {
  const { groupId } = await params;
  const body = await request.json();

  let title: string | undefined;
  if ("title" in body) {
    if (typeof body.title !== "string") {
      return badRequest("title must be a string");
    }
    title = body.title;
  }

  // titleDe/titleEn ride along in the same direct song_group update as title -- none of the
  // three are versioned data (spec §3.1 of 00-foundation.md / mui-and-fixes spec §3.1).
  let titleDe: string | null | undefined;
  if ("titleDe" in body) {
    if (body.titleDe !== null && typeof body.titleDe !== "string") {
      return badRequest("titleDe must be a string or null");
    }
    titleDe = body.titleDe;
  }

  let titleEn: string | null | undefined;
  if ("titleEn" in body) {
    if (body.titleEn !== null && typeof body.titleEn !== "string") {
      return badRequest("titleEn must be a string or null");
    }
    titleEn = body.titleEn;
  }

  const hasGroupFields = title !== undefined || titleDe !== undefined || titleEn !== undefined;

  const patch: Record<string, unknown> = {};
  for (const field of ["key", "transpose", "instrument"] as const) {
    if (field in body) {
      if (typeof body[field] !== "string") {
        return badRequest(`${field} must be a string`);
      }
      patch[field] = body[field];
    }
  }
  for (const field of ["notes", "sheet"] as const) {
    if (field in body) {
      if (body[field] !== null && typeof body[field] !== "string") {
        return badRequest(`${field} must be a string or null`);
      }
      patch[field] = body[field];
    }
  }

  const hasVersionedFields = Object.keys(patch).length > 0;

  try {
    const { group, currentVersion } = await prisma.$transaction(async (tx) => {
      const updatedGroup = hasGroupFields
        ? await tx.songGroup.update({
            where: { id: groupId },
            data: {
              ...(title !== undefined ? { title } : {}),
              ...(titleDe !== undefined ? { titleDe } : {}),
              ...(titleEn !== undefined ? { titleEn } : {}),
            },
          })
        : await tx.songGroup.findUnique({ where: { id: groupId } });

      if (!updatedGroup) {
        throw new SongGroupNotFoundError(groupId);
      }

      const version = hasVersionedFields
        ? await bumpSongVersion(groupId, patch, tx)
        : await tx.song.findFirst({ where: { songGroupId: groupId }, orderBy: { version: "desc" } });

      if (!version) {
        throw new SongGroupNotFoundError(groupId);
      }

      return { group: updatedGroup, currentVersion: version };
    });

    return NextResponse.json({
      id: group.id,
      archived: group.archived,
      title: group.title,
      titleDe: group.titleDe,
      titleEn: group.titleEn,
      key: currentVersion.key,
      transpose: currentVersion.transpose,
      instrument: currentVersion.instrument,
      notes: currentVersion.notes,
      sheet: currentVersion.sheet,
      version: currentVersion.version,
    });
  } catch (error) {
    if (error instanceof SongGroupNotFoundError) {
      return notFound(error.message);
    }
    throw error;
  }
};
