// Chromatic key order for the song list's "Key (C C# D)" sort (as opposed to the plain
// alphabetical "Key (A B C)" sort). This is 17 entries, not 12: each of the 5 accidental pitch
// classes appears twice -- sharp spelling immediately followed by its enharmonic flat spelling
// (e.g. C#, Db) -- because sharp- and flat-spelled songs in the same pitch class should sort
// adjacently rather than colliding into one slot. Fixed by spec; do not derive this cleverly.
const CHROMATIC_KEY_ORDER = [
  "C",
  "C#",
  "Db",
  "D",
  "D#",
  "Eb",
  "E",
  "F",
  "F#",
  "Gb",
  "G",
  "G#",
  "Ab",
  "A",
  "A#",
  "Bb",
  "B",
] as const;

export type ChromaticKeyToken = (typeof CHROMATIC_KEY_ORDER)[number];

export const CHROMATIC_KEY_RANK: Record<string, number> = Object.fromEntries(
  CHROMATIC_KEY_ORDER.map((token, index) => [token, index]),
);

// Extracts the leading key token from a song's free-text `key` field (e.g. "D# -> E" -> "D#",
// "D# (capo 3)" -> "D#"). The field must tolerate mid-song key changes and unset markers like
// "?", so it isn't guaranteed to be a single clean token -- only the start of the trimmed
// string is matched, everything after is ignored. The optional lowercase "b" is the flat
// modifier, not a second note letter, so "B" alone (no following "b") parses as natural B.
const LEADING_KEY_PATTERN = /^([A-Ga-g])(#|b)?/;

// Returns the token's rank in CHROMATIC_KEY_ORDER, or null if the string doesn't start with a
// recognizable note (empty, "?", free text, etc.) -- callers sort those after all known keys.
export const chromaticKeyRank = (key: string): number | null => {
  const match = LEADING_KEY_PATTERN.exec(key.trim());
  if (!match) return null;

  const [, letter, modifier] = match;
  const token = letter.toUpperCase() + (modifier ?? "");
  const rank = CHROMATIC_KEY_RANK[token];
  return rank ?? null;
};
