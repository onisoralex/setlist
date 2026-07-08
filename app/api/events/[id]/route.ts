import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound } from "@/lib/api-response";
import { resolveTrackListEntry } from "@/lib/track-list";
import { EventStatus, EventType } from "@/generated/prisma/enums";

const STATUS_VALUES = Object.values(EventStatus);
const TYPE_VALUES = Object.values(EventType);

type RouteParams = { params: Promise<{ id: string }> };

// GET /api/events/:id -- event detail with its ordered, override-resolved tracklist. The
// frontend receives plain display fields, never raw override_* columns (spec §2) -- all
// resolution happens here via lib/track-list.ts, not in the client.
export const GET = async (_request: NextRequest, { params }: RouteParams) => {
  const { id } = await params;

  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      trackListSongs: {
        orderBy: { position: "asc" },
        include: { song: { include: { songGroup: true } } },
      },
    },
  });

  if (!event) {
    return notFound(`Event ${id} not found`);
  }

  const { trackListSongs, ...eventFields } = event;

  return NextResponse.json({
    ...eventFields,
    songs: trackListSongs.map((row) => resolveTrackListEntry(row, row.song)),
  });
};

// PATCH /api/events/:id -- edit event metadata (date, type) and/or advance status. Status
// transitions are always an explicit call the frontend makes on user action, never triggered
// automatically by this route or any background job (spec §3.2).
export const PATCH = async (request: NextRequest, { params }: RouteParams) => {
  const { id } = await params;
  const body = await request.json();

  const existing = await prisma.event.findUnique({ where: { id } });
  if (!existing) {
    return notFound(`Event ${id} not found`);
  }

  const data: { date?: Date; type?: EventType; name?: string | null; status?: EventStatus } = {};

  if ("date" in body) {
    if (typeof body.date !== "string" || Number.isNaN(Date.parse(body.date))) {
      return badRequest("date must be an ISO date string");
    }
    data.date = new Date(body.date);
  }
  if ("type" in body) {
    if (typeof body.type !== "string" || !TYPE_VALUES.includes(body.type as (typeof TYPE_VALUES)[number])) {
      return badRequest(`type must be one of ${TYPE_VALUES.join(", ")}`);
    }
    data.type = body.type as EventType;
  }
  if ("name" in body) {
    if (body.name !== null && typeof body.name !== "string") {
      return badRequest("name must be a string or null");
    }
    const trimmed = typeof body.name === "string" ? body.name.trim() : null;
    data.name = trimmed === "" ? null : trimmed;
  }
  if ("status" in body) {
    if (typeof body.status !== "string" || !STATUS_VALUES.includes(body.status as (typeof STATUS_VALUES)[number])) {
      return badRequest(`status must be one of ${STATUS_VALUES.join(", ")}`);
    }
    data.status = body.status as EventStatus;
  }

  // "name required when type is other" depends on the *combined* state after applying
  // whatever subset of type/name this request actually changes -- e.g. renaming an existing
  // other-type event without resending type, or switching to other without resending name.
  const effectiveType = "type" in data ? data.type : existing.type;
  const effectiveName = "name" in data ? data.name : existing.name;
  if (effectiveType === "other" && (!effectiveName || effectiveName.trim() === "")) {
    return badRequest("name is required when type is other");
  }

  try {
    const event = await prisma.event.update({ where: { id }, data });
    return NextResponse.json(event);
  } catch {
    return notFound(`Event ${id} not found`);
  }
};
