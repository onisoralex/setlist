import type { Song, SongGroup, TrackListSong } from "../generated/prisma/client";

// `title` lives on the song's group, not on `song` itself (see prisma/schema.prisma SongGroup
// comment) -- resolveTrackListEntry needs the group's title alongside the versioned fields, so
// callers must fetch `song` with its `songGroup` relation included (see
// app/api/events/[id]/route.ts's GET handler) rather than passing a bare `Song` row.
type SongWithGroup = Song & { songGroup: SongGroup };

// The six fields that can be overridden per-event (spec 00-foundation.md §3.3). Kept as a
// tuple of keys rather than duplicated per-field code so resolveTrackListEntry and any future
// caller (e.g. the overrides PATCH handler) share one source of truth for "which fields".
const OVERRIDABLE_FIELDS = ["title", "key", "transpose", "instrument", "notes", "sheet"] as const;

// Spacers are independent, reorderable "blank line" entries (spec §1) -- not an attribute on a
// song row -- so a resolved entry is a discriminated union on entryType rather than a single
// shape with an optional groupBreakBefore flag.
export type ResolvedTrackListEntry =
  | {
      id: string;
      position: number;
      entryType: "song";
      songGroupId: string;
      songId: string;
      title: string;
      titleDe: string | null;
      titleEn: string | null;
      key: string;
      transpose: string;
      instrument: string;
      notes: string | null;
      sheet: string | null;
    }
  | {
      id: string;
      position: number;
      entryType: "spacer";
    };

/**
 * Override resolution (spec 00-foundation.md §3.3): for each overridable field, the value the
 * frontend should display is `override_<field> ?? song.<field>`. This is intentionally the
 * only place that logic lives -- GET /api/events/:id calls this rather than resolving inline,
 * so the frontend never has to know overrides exist at all. Spacer rows have no song to resolve
 * against (song will be null per the optional Prisma relation) and are returned as-is.
 */
export const resolveTrackListEntry = (
  row: TrackListSong,
  song: SongWithGroup | null,
): ResolvedTrackListEntry => {
  if (row.entryType === "spacer") {
    return { id: row.id, position: row.position, entryType: "spacer" };
  }

  return {
    id: row.id,
    position: row.position,
    entryType: "song",
    songGroupId: row.songGroupId!,
    songId: row.songId!,
    title: row.overrideTitle ?? song!.songGroup.title,
    // No per-event override exists for these -- only the primary `title` is overridable
    // (spec 00-foundation.md §1); German/English names are stable identity data, same
    // reasoning as `title` itself, so they always come straight from the song group.
    titleDe: song!.songGroup.titleDe,
    titleEn: song!.songGroup.titleEn,
    key: row.overrideKey ?? song!.key,
    transpose: row.overrideTranspose ?? song!.transpose,
    instrument: row.overrideInstrument ?? song!.instrument,
    notes: row.overrideNotes ?? song!.notes,
    sheet: row.overrideSheet ?? song!.sheet,
  };
};

// Tri-state PATCH body for .../overrides (spec §2, §6): a key absent from the body means
// "don't touch this override"; present as `null` means "clear it"; present as a string
// (including "") means "set it". `Partial<...>` alone can't express "present but null" vs
// "absent" once the value round-trips through JSON.parse, so route handlers must check
// `field in body`, not `body.field !== undefined` -- see app/api/events/[id]/songs/[trackListSongId]/overrides/route.ts.
export type OverridePatch = Partial<Record<(typeof OVERRIDABLE_FIELDS)[number], string | null>>;

const OVERRIDE_COLUMN_BY_FIELD = {
  title: "overrideTitle",
  key: "overrideKey",
  transpose: "overrideTranspose",
  instrument: "overrideInstrument",
  notes: "overrideNotes",
  sheet: "overrideSheet",
} as const;

/**
 * Translates a raw JSON request body into a Prisma update payload for track_list_song,
 * applying tri-state semantics per field: absent keys are omitted from the returned object
 * entirely (so Prisma leaves that column untouched), present keys are passed through as-is
 * (including null, which clears the override).
 */
export const buildOverrideUpdate = (
  body: Record<string, unknown>,
): Partial<Record<(typeof OVERRIDE_COLUMN_BY_FIELD)[keyof typeof OVERRIDE_COLUMN_BY_FIELD], string | null>> => {
  const update: Record<string, string | null> = {};

  for (const field of OVERRIDABLE_FIELDS) {
    if (field in body) {
      const value = body[field];
      if (value !== null && typeof value !== "string") {
        throw new InvalidOverrideValueError(field);
      }
      update[OVERRIDE_COLUMN_BY_FIELD[field]] = value;
    }
  }

  return update;
};

export class InvalidOverrideValueError extends Error {
  constructor(field: string) {
    super(`Override field "${field}" must be a string or null`);
    this.name = "InvalidOverrideValueError";
  }
}
