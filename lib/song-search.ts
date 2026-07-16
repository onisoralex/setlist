// Shared multi-scope, diacritic-insensitive search predicate (spec mui-and-fixes SS3.2/SS3.3).
// One implementation used by both the song list's filter (app/songs/page.tsx) and the
// tracklist editor's combobox (app/events/[id]/edit/page.tsx) -- both need "does any enabled
// scope's field, normalized, include the normalized query".
import { normalizeForSearch } from "@/lib/search-normalize";
import { formatSongDisplayName } from "@/lib/song-display-name";
import type { Settings } from "@/lib/types";

export type SearchScopes = {
  name: boolean;
  notes: boolean;
  instrument: boolean;
  key: boolean;
  chords: boolean;
};

export const scopesFromSettings = (settings: Settings): SearchScopes => ({
  name: settings.searchScopeName,
  notes: settings.searchScopeNotes,
  instrument: settings.searchScopeInstrument,
  key: settings.searchScopeKey,
  chords: settings.searchScopeChords,
});

// Minimal shape covering both SongSummary and the "song" branch of ResolvedTrackListEntry --
// both carry these same field names, so one predicate serves both call sites.
export type SearchableSong = {
  title: string;
  titleDe: string | null;
  titleEn: string | null;
  key: string;
  instrument: string;
  notes: string | null;
  sheet: string | null;
};

export const matchesSearch = (song: SearchableSong, query: string, scopes: SearchScopes): boolean => {
  const q = normalizeForSearch(query.trim());
  if (!q) return true;

  // All scopes off = match nothing, not a silent fallback to searching everything (spec's
  // explicit recommendation) -- a query with no enabled field to check against can never match.
  const fields: string[] = [];
  if (scopes.name) fields.push(formatSongDisplayName(song));
  if (scopes.notes) fields.push(song.notes ?? "");
  if (scopes.instrument) fields.push(song.instrument);
  if (scopes.key) fields.push(song.key);
  if (scopes.chords) fields.push(song.sheet ?? "");

  return fields.some((field) => normalizeForSearch(field).includes(q));
};
