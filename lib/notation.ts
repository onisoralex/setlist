// Spec 00-foundation.md §3.4: chord sheets are stored with a fixed internal octave-up
// symbol ("+") and substituted to the user's display preference only at render time, purely
// client-side. This keeps the stored format and API contract stable even if the user changes
// their preferred symbol later -- the API always returns raw "+".
export const applyOctaveUpSymbol = (sheet: string, symbol: string): string =>
  sheet.replaceAll("+", symbol);
