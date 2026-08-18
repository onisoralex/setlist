import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest } from "@/lib/api-response";
import { EventStatus, EventType } from "@/generated/prisma/enums";

const STATUS_VALUES = Object.values(EventStatus);
const TYPE_VALUES = Object.values(EventType);

// GET /api/events -- list events, filterable by status and date range.
export const GET = async (request: NextRequest) => {
  const params = request.nextUrl.searchParams;
  const includeArchived = params.get("includeArchived") === "true";
  const status = params.get("status");
  const from = params.get("from");
  const to = params.get("to");

  if (status && !STATUS_VALUES.includes(status as (typeof STATUS_VALUES)[number])) {
    return badRequest(`status must be one of ${STATUS_VALUES.join(", ")}`);
  }

  const events = await prisma.event.findMany({
    where: {
      ...(includeArchived ? {} : { archived: false }),
      ...(status ? { status: status as (typeof STATUS_VALUES)[number] } : {}),
      ...(from || to
        ? {
            date: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
    },
    // Most recent event first (spec change per user feedback) -- was "asc".
    // Tiebreak on createdAt: same-day events tie on date alone, and Postgres
    // doesn't guarantee tie order matches insertion order -- without this,
    // an earlier-created same-day event could outrank a later one.
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(events);
};

// POST /api/events -- create an event; status defaults to draft (Prisma schema default).
export const POST = async (request: NextRequest) => {
  const body = await request.json();

  if (typeof body.date !== "string" || Number.isNaN(Date.parse(body.date))) {
    return badRequest("date must be an ISO date string");
  }
  if (typeof body.type !== "string" || !TYPE_VALUES.includes(body.type as (typeof TYPE_VALUES)[number])) {
    return badRequest(`type must be one of ${TYPE_VALUES.join(", ")}`);
  }

  let name: string | null = null;
  if (body.type === "other") {
    if (typeof body.name !== "string" || body.name.trim() === "") {
      return badRequest("name is required when type is other");
    }
    name = body.name.trim();
  } else if ("name" in body && body.name !== null && body.name !== undefined) {
    if (typeof body.name !== "string") {
      return badRequest("name must be a string");
    }
    name = body.name.trim() === "" ? null : body.name.trim();
  }

  const event = await prisma.event.create({
    data: {
      date: new Date(body.date),
      type: body.type as EventType,
      name,
    },
  });

  return NextResponse.json(event, { status: 201 });
};
