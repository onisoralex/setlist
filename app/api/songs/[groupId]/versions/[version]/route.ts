import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound } from "@/lib/api-response";

type RouteParams = { params: Promise<{ groupId: string; version: string }> };

// GET /api/songs/:groupId/versions/:version -- a specific historical version, read-only.
export const GET = async (_request: NextRequest, { params }: RouteParams) => {
  const { groupId, version: versionParam } = await params;
  const version = Number(versionParam);

  if (!Number.isInteger(version) || version < 1) {
    return badRequest("version must be a positive integer");
  }

  const song = await prisma.song.findUnique({
    where: { songGroupId_version: { songGroupId: groupId, version } },
    include: { songGroup: true },
  });

  if (!song) {
    return notFound(`Version ${version} of song group ${groupId} not found`);
  }

  // `title` isn't actually versioned data -- it lives on song_group, not song (see
  // prisma/schema.prisma SongGroup comment) -- but a specific historical version's response is
  // still shaped like a song (title included) for the frontend's sake, so it's merged in here
  // from the group rather than the (nonexistent) per-version value.
  const { songGroup, ...songFields } = song;
  return NextResponse.json({ ...songFields, title: songGroup.title });
};
