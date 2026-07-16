// Joins a song's Romanian/German/English names into one display string (spec §3.1). Fixed
// order Romanian -> German -> English; null/empty names are dropped so there's never a
// dangling " | " separator. This is a display-formatting collapse of null/empty, not the
// tri-state override semantics used by track_list_song.override_* (see lib/track-list.ts) --
// don't conflate the two.
export const formatSongDisplayName = (song: {
  title: string;
  titleDe: string | null;
  titleEn: string | null;
}): string =>
  [song.title, song.titleDe, song.titleEn]
    .filter((name): name is string => name != null && name.trim() !== "")
    .join(" | ");
