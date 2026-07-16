// Validation + tri-state PATCH body handling for /api/settings (theme settings feature).
// Mirrors the tri-state pattern established in lib/track-list.ts's buildOverrideUpdate:
// a key absent from the body means "don't touch it"; for color fields, present as `null`
// means "clear the override" and present as a string means "set it". Font-size (and other
// CSS-length) fields have no null/override semantics (they're always-on, required settings),
// so they're simpler: absent = don't touch, present = must be a valid CSS length string.

const CSS_LENGTH_PATTERN = /^[0-9]+(\.[0-9]+)?(rem|px|em)$/;
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export const FONT_SIZE_FIELDS = [
  "fontSizeSm",
  "fontSizeMd",
  "fontSizeLg",
  "fontSizeXl",
  "fontSizeHeading",
  "fontSizeNavBrand",
  "fontSizeNavLink",
] as const;

// Not a font size, but validated with the same CSS-length rule -- kept as its own
// single-field group (rather than folded into FONT_SIZE_FIELDS) since the Settings page
// presents it as its own "Display" control, not part of the font-size form.
export const SPACER_HEIGHT_FIELDS = ["spacerHeight"] as const;

export const BUTTON_COLOR_FIELDS = [
  "btnPrimaryBackground",
  "btnPrimaryColor",
  "btnSecondaryBackground",
  "btnSecondaryColor",
  "btnDangerBackground",
  "btnDangerColor",
] as const;

export const BACKGROUND_COLOR_FIELDS = ["backgroundColor"] as const;

export const SEARCH_SCOPE_FIELDS = [
  "searchScopeName",
  "searchScopeNotes",
  "searchScopeInstrument",
  "searchScopeKey",
  "searchScopeChords",
] as const;

// Renamed from isValidFontSize now that spacerHeight (not a font size) validates through the
// same rule -- the name was font-size-specific, the check itself never was.
export const isValidCssLength = (value: unknown): value is string =>
  typeof value === "string" && CSS_LENGTH_PATTERN.test(value);

export const isValidHexColor = (value: unknown): value is string =>
  typeof value === "string" && HEX_COLOR_PATTERN.test(value);

export class InvalidSettingsValueError extends Error {
  constructor(field: string, reason: string) {
    super(`Settings field "${field}" ${reason}`);
    this.name = "InvalidSettingsValueError";
  }
}

/**
 * Builds the Prisma update payload for a set of required CSS-length fields from a raw PATCH
 * body. Absent fields are omitted from the returned object (left untouched); present fields
 * must validate as a CSS length or this throws. Shared by the 7 font-size fields and the
 * single spacerHeight field -- same validation, same absent/present semantics.
 */
const buildCssLengthUpdate = <T extends string>(
  body: Record<string, unknown>,
  fields: readonly T[],
): Partial<Record<T, string>> => {
  const update: Record<string, string> = {};

  for (const field of fields) {
    if (field in body) {
      const value = body[field];
      if (!isValidCssLength(value)) {
        throw new InvalidSettingsValueError(field, "must be a CSS length like \"1.5rem\"");
      }
      update[field] = value;
    }
  }

  return update as Partial<Record<T, string>>;
};

export const buildFontSizeUpdate = (
  body: Record<string, unknown>,
): Partial<Record<(typeof FONT_SIZE_FIELDS)[number], string>> => buildCssLengthUpdate(body, FONT_SIZE_FIELDS);

export const buildSpacerHeightUpdate = (
  body: Record<string, unknown>,
): Partial<Record<(typeof SPACER_HEIGHT_FIELDS)[number], string>> => buildCssLengthUpdate(body, SPACER_HEIGHT_FIELDS);

/**
 * Builds the Prisma update payload for a set of nullable hex-color fields, tri-state like
 * lib/track-list.ts's buildOverrideUpdate: absent = don't touch, null = clear the override,
 * string = set it (must be a 6-digit hex color). Shared by the 6 button-color fields and the
 * single backgroundColor field -- same validation, same tri-state semantics.
 */
const buildNullableHexColorUpdate = <T extends string>(
  body: Record<string, unknown>,
  fields: readonly T[],
): Partial<Record<T, string | null>> => {
  const update: Record<string, string | null> = {};

  for (const field of fields) {
    if (field in body) {
      const value = body[field];
      if (value !== null && !isValidHexColor(value)) {
        throw new InvalidSettingsValueError(field, "must be a hex color like \"#2563eb\" or null");
      }
      update[field] = value;
    }
  }

  return update as Partial<Record<T, string | null>>;
};

export const buildButtonColorUpdate = (
  body: Record<string, unknown>,
): Partial<Record<(typeof BUTTON_COLOR_FIELDS)[number], string | null>> =>
  buildNullableHexColorUpdate(body, BUTTON_COLOR_FIELDS);

export const buildBackgroundColorUpdate = (
  body: Record<string, unknown>,
): Partial<Record<(typeof BACKGROUND_COLOR_FIELDS)[number], string | null>> =>
  buildNullableHexColorUpdate(body, BACKGROUND_COLOR_FIELDS);

/**
 * Builds the Prisma update payload for the 5 search-scope booleans. Simpler than the
 * color/length builders above: absent = don't touch, present = must be a boolean, no
 * null/"clear" state exists for "is this scope searched".
 */
export const buildSearchScopeUpdate = (
  body: Record<string, unknown>,
): Partial<Record<(typeof SEARCH_SCOPE_FIELDS)[number], boolean>> => {
  const update: Record<string, boolean> = {};

  for (const field of SEARCH_SCOPE_FIELDS) {
    if (field in body) {
      const value = body[field];
      if (typeof value !== "boolean") {
        throw new InvalidSettingsValueError(field, "must be a boolean");
      }
      update[field] = value;
    }
  }

  return update;
};
