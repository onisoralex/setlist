// Single source of truth for German date/time display formatting (docs/specs/00-foundation.md
// screens all render dates as DD.MM.YYYY). `toLocaleDateString("de-DE")` alone does NOT
// zero-pad single-digit days/months (e.g. "7.7.2026") -- explicit Intl options are required.

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
};

const DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  ...DATE_OPTIONS,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
};

export const formatGermanDate = (isoDateOrDate: string | Date): string => {
  const date = typeof isoDateOrDate === "string" ? new Date(isoDateOrDate) : isoDateOrDate;
  return date.toLocaleDateString("de-DE", DATE_OPTIONS);
};

export const formatGermanDateTime = (isoDateOrDate: string | Date): string => {
  const date = typeof isoDateOrDate === "string" ? new Date(isoDateOrDate) : isoDateOrDate;
  return date.toLocaleString("de-DE", DATE_TIME_OPTIONS);
};

const TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
};

// "HH:MM" (24h) for timestamps from the current day; falls back to the full date + time when
// the timestamp is from another day, so an old time-of-day alone can't pass as recent.
export const formatGermanTimeOrDateTime = (date: Date, now: Date = new Date()): string =>
  date.toDateString() === now.toDateString()
    ? date.toLocaleTimeString("de-DE", TIME_OPTIONS)
    : formatGermanDateTime(date);
