import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest } from "@/lib/api-response";
import {
  buildBackgroundColorUpdate,
  buildButtonColorUpdate,
  buildFontSizeUpdate,
  buildSearchScopeUpdate,
  buildSpacerHeightUpdate,
  InvalidSettingsValueError,
} from "@/lib/settings";

// The settings table is a CHECK-constrained singleton (id must be true) -- upsert on that
// fixed id is how both GET and PATCH guarantee the row exists without a separate seed step
// being a hard requirement.
const SETTINGS_ID = true;

export const GET = async () => {
  const settings = await prisma.settings.upsert({
    where: { id: SETTINGS_ID },
    update: {},
    create: { id: SETTINGS_ID },
  });
  return NextResponse.json(settings);
};

export const PATCH = async (request: NextRequest) => {
  const body = await request.json();

  const update: Record<string, string | null | boolean> = {};

  if ("octaveUpDisplaySymbol" in body) {
    if (typeof body.octaveUpDisplaySymbol !== "string" || body.octaveUpDisplaySymbol === "") {
      return badRequest("octaveUpDisplaySymbol must be a non-empty string");
    }
    update.octaveUpDisplaySymbol = body.octaveUpDisplaySymbol;
  }

  try {
    Object.assign(update, buildFontSizeUpdate(body));
    Object.assign(update, buildButtonColorUpdate(body));
    Object.assign(update, buildSpacerHeightUpdate(body));
    Object.assign(update, buildBackgroundColorUpdate(body));
    Object.assign(update, buildSearchScopeUpdate(body));
  } catch (err) {
    if (err instanceof InvalidSettingsValueError) {
      return badRequest(err.message);
    }
    throw err;
  }

  const settings = await prisma.settings.upsert({
    where: { id: SETTINGS_ID },
    update,
    create: { id: SETTINGS_ID, ...update },
  });

  return NextResponse.json(settings);
};
