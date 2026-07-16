// Diacritic/accent-insensitive search (spec mui-and-fixes SS3.3). NFD canonical decomposition
// splits each accented character into base letter + combining mark, then this strips every
// combining mark in the U+0300-U+036F ("Combining Diacritical Marks") block. That one regex,
// with no hand-rolled character map, correctly handles Romanian a-breve/a-circumflex, both
// real-world encodings of s-comma/t-comma (the correct COMBINING COMMA BELOW and the legacy
// COMBINING CEDILLA some fonts use), and German a/o/u-umlaut -- all of their combining marks
// fall inside this one block.
const COMBINING_DIACRITICS = new RegExp("[\u0300-\u036f]", "g");

// Normalizing both sides of a comparison through this same function is what makes matching
// bidirectional (searching "a" matches its accented form and vice versa) -- no special-casing
// needed, see callers in lib/song-search.ts.
export const normalizeForSearch = (text: string): string =>
  text.normalize("NFD").replace(COMBINING_DIACRITICS, "").toLowerCase();
