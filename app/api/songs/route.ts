import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest } from "@/lib/api-response";

// GET /api/songs -- list song groups with their current version's summary fields.
// "Current version" is MAX(version) per group, computed here rather than stored anywhere
// (see prisma/schema.prisma SongGroup comment) -- fetched by ordering each group's songs
// descending and taking the first.
export const GET = async (request: NextRequest) => {
  const includeArchived = request.nextUrl.searchParams.get("includeArchived") === "true";

  const groups = await prisma.songGroup.findMany({
    where: includeArchived ? undefined : { archived: false },
    orderBy: { createdAt: "asc" },
    include: {
      songs: {
        orderBy: { version: "desc" },
        take: 1,
      },
    },
  });

  const result = groups
    // A group with zero song rows can't happen in normal operation (POST always creates
    // version 1 alongside the group), but guarding here avoids a crash if data ever ends
    // up inconsistent rather than silently returning a broken row to the frontend.
    .filter((group) => group.songs.length > 0)
    .map((group) => {
      const current = group.songs[0];
      return {
        id: group.id,
        archived: group.archived,
        title: group.title,
        titleDe: group.titleDe,
        titleEn: group.titleEn,
        key: current.key,
        transpose: current.transpose,
        instrument: current.instrument,
        // Widened for Phase E multi-scope search (spec §3.3) -- client-side filtering can't
        // search fields it was never sent. Deliberate payload-size tradeoff at this app's
        // single-user, dozens-to-low-hundreds-of-songs scale.
        notes: current.notes,
        sheet: current.sheet,
      };
    });

  return NextResponse.json(result);
};

// POST /api/songs -- create a new song: one song_group row + one song row (version 1), in
// a transaction so a group can never exist without its first version or vice versa.
export const POST = async (request: NextRequest) => {
  const body = await request.json();

  if (typeof body.title !== "string" || body.title.trim() === "") {
    return badRequest("title is required");
  }
  if (typeof body.key !== "string") {
    return badRequest("key is required");
  }
  if (typeof body.transpose !== "string") {
    return badRequest("transpose is required");
  }
  if (typeof body.instrument !== "string") {
    return badRequest("instrument is required");
  }
  if ("titleDe" in body && body.titleDe !== null && typeof body.titleDe !== "string") {
    return badRequest("titleDe must be a string or null");
  }
  if ("titleEn" in body && body.titleEn !== null && typeof body.titleEn !== "string") {
    return badRequest("titleEn must be a string or null");
  }

  const result = await prisma.$transaction(async (tx) => {
    const group = await tx.songGroup.create({
      data: {
        title: body.title,
        titleDe: typeof body.titleDe === "string" ? body.titleDe : null,
        titleEn: typeof body.titleEn === "string" ? body.titleEn : null,
      },
    });
    const song = await tx.song.create({
      data: {
        songGroupId: group.id,
        version: 1,
        key: body.key,
        transpose: body.transpose,
        instrument: body.instrument,
        notes: typeof body.notes === "string" ? body.notes : null,
        sheet: typeof body.sheet === "string" ? body.sheet : null,
      },
    });
    return { group, song };
  });

  return NextResponse.json(
    {
      id: result.group.id,
      archived: result.group.archived,
      title: result.group.title,
      titleDe: result.group.titleDe,
      titleEn: result.group.titleEn,
      key: result.song.key,
      transpose: result.song.transpose,
      instrument: result.song.instrument,
      notes: result.song.notes,
      sheet: result.song.sheet,
      version: result.song.version,
    },
    { status: 201 },
  );
};
