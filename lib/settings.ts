// Validation + tri-state PATCH body handling for /api/settings (theme settings feature).
// Mirrors the tri-state pattern established in lib/track-list.ts's buildOverrideUpdate:
// a key absent from the body means "don't touch it"; for color fields, present as `null`
// means "clear the override" and present as a string means "set it". Font-size fields have
// no null/override semantics (they're always-on, required settings), so they're simpler:
// absent = don't touch, present = must be a valid CSS length string.

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

export const BUTTON_COLOR_FIELDS = [
  "btnPrimaryBackground",
  "btnPrimaryColor",
  "btnSecondaryBackground",
  "btnSecondaryColor",
  "btnDangerBackground",
  "btnDangerColor",
] as const;

export const isValidFontSize = (value: unknown): value is string =>
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
 * Builds the Prisma update payload for the 7 required font-size fields from a raw PATCH
 * body. Absent fields are omitted from the returned object (left untouched); present fields
 * must validate as a CSS length or this throws.
 */
export const buildFontSizeUpdate = (
  body: Record<string, unknown>,
): Partial<Record<(typeof FONT_SIZE_FIELDS)[number], string>> => {
  const update: Record<string, string> = {};

  for (const field of FONT_SIZE_FIELDS) {
    if (field in body) {
      const value = body[field];
      if (!isValidFontSize(value)) {
        throw new InvalidSettingsValueError(field, "must be a CSS length like \"1.5rem\"");
      }
      update[field] = value;
    }
  }

  return update;
};

/**
 * Builds the Prisma update payload for the 6 nullable button-color fields, tri-state like
 * lib/track-list.ts's buildOverrideUpdate: absent = don't touch, null = clear the override,
 * string = set it (must be a 6-digit hex color).
 */
export const buildButtonColorUpdate = (
  body: Record<string, unknown>,
): Partial<Record<(typeof BUTTON_COLOR_FIELDS)[number], string | null>> => {
  const update: Record<string, string | null> = {};

  for (const field of BUTTON_COLOR_FIELDS) {
    if (field in body) {
      const value = body[field];
      if (value !== null && !isValidHexColor(value)) {
        throw new InvalidSettingsValueError(field, "must be a hex color like \"#2563eb\" or null");
      }
      update[field] = value;
    }
  }

  return update;
};
