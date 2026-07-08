import { prisma } from "./prisma";
import type { Prisma } from "../generated/prisma/client";

// Accepts either the top-level `prisma` client or an interactive transaction client (`tx`
// from `prisma.$transaction(async (tx) => ...)`) -- lets a caller fold a version bump into a
// larger transaction (e.g. alongside a songGroup.title update) instead of always opening its
// own, while still defaulting to a self-contained transaction for callers that don't need that.
type PrismaClientOrTx = typeof prisma | Prisma.TransactionClient;

// Fields that can be carried forward/changed by a "change everywhere going forward" edit.
// Kept as an explicit type (rather than `Partial<Song>`) so a caller can't accidentally
// pass through fields like `id` or `version` that this module alone is responsible for.
// Deliberately excludes `title`: title lives on `song_group` now (it's the song's stable
// identity, not versioned data) and is updated directly via songGroup.update, entirely outside
// this module's concern.
export type SongFields = {
  key: string;
  transpose: string;
  instrument: string;
  notes: string | null;
  sheet: string | null;
};

export type SongVersionPatch = Partial<SongFields>;

/**
 * "Change everywhere going forward" (spec 00-foundation.md §3.1).
 *
 * Inserts a new, immutable `song` row (current version's fields merged with `patch`) and
 * re-points every eligible event's track_list_song.song_id at it. A track_list_song row is
 * eligible only if its event is still draft/scheduled AND unlocked (§3.2) -- rows on played
 * or locked events are left untouched, which is the mechanism that guarantees history never
 * silently changes underneath an event that's already happened or been frozen.
 *
 * Runs as a single transaction: the version insert and every bump either all happen or none do,
 * so a track_list_song can never end up pointing at a version that doesn't exist. Defaults to
 * opening its own transaction against `prisma`, but accepts an existing `tx` (from a caller
 * already inside `prisma.$transaction`) so this can be folded into a larger atomic operation --
 * see PATCH /api/songs/:groupId, which folds this together with a songGroup.title update.
 *
 * Unconditionally creates a new version whenever called -- there is no "does only title
 * differ" special case here, because title isn't part of `patch` at all anymore.
 */
export const bumpSongVersion = async (
  songGroupId: string,
  patch: SongVersionPatch,
  client?: PrismaClientOrTx,
) => {
  const run = async (tx: PrismaClientOrTx) => {
    const currentVersion = await tx.song.findFirst({
      where: { songGroupId },
      orderBy: { version: "desc" },
    });

    if (!currentVersion) {
      throw new SongGroupNotFoundError(songGroupId);
    }

    const newVersion = await tx.song.create({
      data: {
        songGroupId,
        version: currentVersion.version + 1,
        key: patch.key ?? currentVersion.key,
        transpose: patch.transpose ?? currentVersion.transpose,
        instrument: patch.instrument ?? currentVersion.instrument,
        // notes/sheet are nullable: a key absent from `patch` means "not supplied, carry
        // forward the current version's value"; a key present (even as `null`) means the
        // caller is explicitly setting/clearing it. `in` distinguishes "absent" from
        // "present but null", which `??` alone cannot do.
        notes: "notes" in patch ? (patch.notes ?? null) : currentVersion.notes,
        sheet: "sheet" in patch ? (patch.sheet ?? null) : currentVersion.sheet,
      },
    });

    await tx.trackListSong.updateMany({
      where: {
        songGroupId,
        event: {
          status: { in: ["draft", "scheduled"] },
          lockedAt: null,
        },
      },
      data: { songId: newVersion.id },
    });

    return newVersion;
  };

  // No client passed -- caller isn't already inside a transaction, so open a self-contained one
  // here (this module's original, standalone behavior). A client IS passed (e.g. the `tx` from
  // PATCH /api/songs/:groupId's prisma.$transaction) -- run inline on it instead of wrapping in
  // another $transaction call, since it's already transactional as part of the caller's scope.
  if (!client) {
    return prisma.$transaction((tx) => run(tx));
  }
  return run(client);
};

export class SongGroupNotFoundError extends Error {
  constructor(songGroupId: string) {
    super(`No song versions found for song group ${songGroupId}`);
    this.name = "SongGroupNotFoundError";
  }
}
