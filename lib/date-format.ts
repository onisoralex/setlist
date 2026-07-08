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
