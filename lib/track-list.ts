import type { Prisma, Song, SongGroup, TrackListSong } from "../generated/prisma/client";
import type { TracklistBatchEntry } from "@/lib/types";

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

/**
 * Diffs the full desired ordered tracklist (`entries`) against what's currently in the DB for
 * `eventId` and writes creates/deletes/reorders/override-patches in one pass (spec
 * tracklist-batch-save §2.5). Replaces the four separate immediate-effect routes (add/remove/
 * reorder/override) this editor used to call one at a time. Caller (the PUT .../tracklist route
 * handler) is responsible for request validation (§2.4) and running this inside
 * `prisma.$transaction` -- this function assumes `entries` is already known-valid (every
 * non-null id belongs to this event and matches its stored entryType/songGroupId,
 * songGroupId/version resolved for new song rows) and does no validation of its own.
 *
 * `resolvedCurrentVersionId` maps a new (id === null) song entry's songGroupId to the
 * already-resolved current-version Song id to snapshot into track_list_song.song_id -- resolved
 * by the caller during validation (§2.4 step 5) so this function doesn't need to re-query it.
 */
export const commitTracklistBatch = async (
  tx: Prisma.TransactionClient,
  eventId: string,
  entries: TracklistBatchEntry[],
  resolvedCurrentVersionId: Map<string, string>,
): Promise<void> => {
  const existingRows = await tx.trackListSong.findMany({ where: { eventId } });

  const submittedIds = new Set(entries.map((entry) => entry.id).filter((id): id is string => id !== null));
  const toDeleteIds = existingRows.filter((row) => !submittedIds.has(row.id)).map((row) => row.id);

  // Step 1: delete rows dropped from the tracklist. Must happen before the position-parking
  // pass below so a deleted row's old position can never collide with a parked/created one.
  if (toDeleteIds.length > 0) {
    await tx.trackListSong.deleteMany({ where: { id: { in: toDeleteIds } } });
  }

  const keepEntries = entries.filter((entry) => entry.id !== null);
  const createEntries = entries.filter((entry) => entry.id === null);

  // Step 2: park every surviving existing row at a unique negative position -- guarantees no
  // collision with each other or with the final 0..N-1 range, same trick PATCH .../reorder
  // already used, generalized here to also make room for simultaneous inserts (step 3).
  await Promise.all(
    keepEntries.map((entry, i) => tx.trackListSong.update({ where: { id: entry.id! }, data: { position: -(i + 1) } })),
  );

  // Step 3: create every new row (song or spacer) at a unique negative position continuing the
  // same sequence, recording which created row corresponds to which index in `entries` so step 5
  // can place it at its final position.
  //
  // Deviation from spec §2.5's literal step 3/4 split: the spec's step 4 only applies override
  // patches to *kept* (already-persisted) song entries, but a newly-added row (id === null) can
  // just as easily carry a non-empty `overrides` -- the buffer lets the user add a song and set
  // an override on it in the same session, before ever clicking Done (spec §1.4's addSong +
  // patchOverrides are both plain local mutations, nothing stops them being called on the same
  // clientKey back to back). Verified this is reachable, not hypothetical: a manual PUT with a
  // new song entry carrying `overrides` silently dropped the override under the spec's literal
  // algorithm. Fixed by folding buildOverrideUpdate's columns straight into the create() call
  // for new song rows, instead of a separate update pass restricted to keepEntries.
  const createdIdByEntryIndex = new Map<number, string>();
  let nextNegative = -(keepEntries.length + 1);
  for (const entry of createEntries) {
    const entryIndex = entries.indexOf(entry);
    const row = await tx.trackListSong.create({
      data:
        entry.kind === "song"
          ? {
              eventId,
              entryType: "song",
              songGroupId: entry.songGroupId,
              // Resolved by the caller's validation pass (§2.4 step 5) -- guaranteed present
              // there for every new song entry.
              songId: resolvedCurrentVersionId.get(entry.songGroupId)!,
              position: nextNegative,
              ...(entry.overrides && Object.keys(entry.overrides).length > 0 ? buildOverrideUpdate(entry.overrides) : {}),
            }
          : {
              eventId,
              entryType: "spacer",
              songGroupId: null,
              songId: null,
              position: nextNegative,
            },
    });
    createdIdByEntryIndex.set(entryIndex, row.id);
    nextNegative -= 1;
  }

  // Step 4: apply override patches to kept (already-persisted) song entries that supplied a
  // non-empty `overrides` -- new rows' overrides are already folded into their create() above.
  // No ordering constraint relative to steps 2/3/5 (never touches `position`), but sequenced
  // here (not Promise.all'd with them) for readability, per spec §2.5.
  for (const entry of keepEntries) {
    if (entry.kind === "song" && entry.overrides && Object.keys(entry.overrides).length > 0) {
      await tx.trackListSong.update({ where: { id: entry.id! }, data: buildOverrideUpdate(entry.overrides) });
    }
  }

  // Step 5: final pass to real positions. Every row involved (kept or newly created) currently
  // sits at a distinct negative position, and every target position (0..entries.length-1) is a
  // distinct non-negative integer, so this cannot collide regardless of write order.
  await Promise.all(
    entries.map((entry, index) => {
      const rowId = entry.id ?? createdIdByEntryIndex.get(index)!;
      return tx.trackListSong.update({ where: { id: rowId }, data: { position: index } });
    }),
  );
};
