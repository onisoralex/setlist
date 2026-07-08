// Shared shapes for data coming back from /api/* -- kept separate from the Prisma-generated
// types because API responses are hand-shaped in route handlers (e.g. resolved tracklist
// rows, song-group summaries), not raw table rows.

export type EventStatus = "draft" | "scheduled" | "played";
export type EventType = "sunday_morning" | "sunday_evening" | "other";

export type SongSummary = {
  id: string;
  archived: boolean;
  title: string;
  key: string;
  transpose: string;
  instrument: string;
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
};
