// Shared shapes for data coming back from /api/* -- kept separate from the Prisma-generated
// types because API responses are hand-shaped in route handlers (e.g. resolved tracklist
// rows, song-group summaries), not raw table rows.

// lib/track-list.ts has no server-only imports (only Prisma-generated *types*, never the
// `prisma` client singleton), so this type-only import is safe to pull into "use client"
// components too -- see that file's OverridePatch doc comment.
import type { OverridePatch } from "@/lib/track-list";

export type EventStatus = "draft" | "scheduled" | "played";
export type EventType = "sunday_morning" | "sunday_evening" | "other";

export type SongSummary = {
  id: string;
  archived: boolean;
  title: string;
  titleDe: string | null;
  titleEn: string | null;
  key: string;
  transpose: string;
  instrument: string;
  // Widened for Phase E multi-scope search (spec §3.3) -- client-side filtering can't search
  // fields it was never sent.
  notes: string | null;
  sheet: string | null;
};

export type SongVersionInfo = {
  id: string;
  version: number;
  createdAt: string;
};

export type SongDetail = {
  id: string;
  archived: boolean;
  title: string;
  titleDe: string | null;
  titleEn: string | null;
  key: string;
  transpose: string;
  instrument: string;
  notes: string | null;
  sheet: string | null;
  version: number;
  versions: SongVersionInfo[];
};

export type EventSummary = {
  id: string;
  date: string;
  type: EventType;
  name: string | null;
  status: EventStatus;
  lockedAt: string | null;
  archived: boolean;
};

// Mirrors lib/track-list.ts's ResolvedTrackListEntry -- spacers are independent, reorderable
// "blank line" entries (spec §1), not an attribute on a song row, hence the discriminated union.
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

export type EventDetail = EventSummary & {
  songs: ResolvedTrackListEntry[];
};

// Request shape for PUT /api/events/:id/tracklist (spec tracklist-batch-save §2.2) --
// TracklistEditModal's full local edit buffer, submitted as one batch commit on Done/close
// rather than one network call per edit action. `id: null` means "not yet persisted, create
// it"; `overrides` omitted/empty means "no override changes for this entry this commit" (same
// tri-state semantics as the old per-row overrides PATCH, just batched).
export type TracklistBatchEntry =
  | {
      kind: "song";
      id: string | null;
      songGroupId: string;
      overrides?: OverridePatch;
    }
  | {
      kind: "spacer";
      id: string | null;
    };

export type TracklistBatchRequest = {
  entries: TracklistBatchEntry[];
};

export type Settings = {
  id: boolean;
  octaveUpDisplaySymbol: string;
  fontSizeSm: string;
  fontSizeMd: string;
  fontSizeLg: string;
  fontSizeXl: string;
  fontSizeHeading: string;
  fontSizeNavBrand: string;
  fontSizeNavLink: string;
  btnPrimaryBackground: string | null;
  btnPrimaryColor: string | null;
  btnSecondaryBackground: string | null;
  btnSecondaryColor: string | null;
  btnDangerBackground: string | null;
  btnDangerColor: string | null;
  searchScopeName: boolean;
  searchScopeNotes: boolean;
  searchScopeInstrument: boolean;
  searchScopeKey: boolean;
  searchScopeChords: boolean;
  spacerHeight: string;
  backgroundColor: string | null;
};
