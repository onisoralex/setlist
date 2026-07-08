# Database structure (current)

Reflects `prisma/schema.prisma` as of the spacer-rows migration. Field names shown as they
appear in the Prisma schema (camelCase); the actual Postgres columns are snake_case via
`@map` (e.g. `songGroupId` -> `song_group_id`) — see the schema file for the exact mapping.

This replaced the original hand-sketched design during implementation — the two biggest
departures worth knowing: `song`/`song_group` are split (not one table with a version column),
and `track_list_song` now represents both songs *and* blank-line spacers as one entry type,
not a boolean flag.

---

* **song_group** — stable identity for a song across all its edited versions, and the home for `title`. No pointer to a specific version, so there's no circular reference to `song`.
  * `id` (UUID, PK)
  * `title` — lives here, not on `song`: it's the song's identity, not versioned data. Editing it is a plain update, never a version bump — it doesn't change over time the way key/instrument/song structure do.
  * `archived` (boolean, default false) — the "delete" affordance; archived groups are hidden from lists, never removed
  * `createdAt`

* **song** — immutable, append-only version rows for everything that *does* change over time. A "change everywhere going forward" edit always inserts a new row; it never updates an old one.
  * `id` (UUID, PK)
  * `songGroupId` (UUID, FK -> song_group)
  * `version` (integer, monotonic per group)
  * `key` (free text, tolerates mid-song key changes, e.g. `"D# (+3)"`)
  * `transpose` (free text, signed semitone offset, e.g. `"+3"`)
  * `instrument` (free text, e.g. `"synth -> bass after bridge"`)
  * `notes` (nullable — the optional third line / Nashville-number shorthand)
  * `sheet` (nullable — full chord sheet; `+` marks octave-up internally, see `settings`)
  * `createdAt`
  * Unique on `(songGroupId, version)`. "Current version" = the row with the highest `version` for a group, computed at query time — never cached or stored.

* **event** — a setlist.
  * `id` (UUID, PK)
  * `date`
  * `type` (enum: `sunday_morning` / `sunday_evening` / `other`)
  * `status` (enum: `draft` / `scheduled` / `played`, default `draft`)
  * `lockedAt` (nullable timestamp) — manual freeze, independent of `status`
  * `archived` (boolean, default false) — same delete-via-archive pattern as `song_group`
  * `createdAt`, `updatedAt`

* **track_list_song** — one row per entry on an event's setlist: a song **or** a blank line ("spacer" — where a prayer/sermon/etc. happens). Both share one reorderable position sequence.
  * `id` (UUID, PK)
  * `eventId` (UUID, FK -> event, cascades on delete)
  * `entryType` (enum: `song` / `spacer`, default `song`)
  * `songGroupId` (UUID, FK -> song_group, **nullable** — only set when `entryType = song`)
  * `songId` (UUID, FK -> song, **nullable** — the exact version this event was built against; only set when `entryType = song`)
  * `position` (integer) — unique per event; songs and spacers are numbered together
  * Six nullable overrides, one per overridable song field — `overrideTitle`, `overrideKey`, `overrideTranspose`, `overrideInstrument`, `overrideNotes`, `overrideSheet`. `NULL` = inherit from the referenced `song` row; a non-null value (**including `""`**) = explicit override for this event only. Unused/ignored on spacer rows.
  * `createdAt`, `updatedAt`
  * A CHECK constraint enforces consistency: `entryType = song` requires both `songGroupId` and `songId` to be set; `entryType = spacer` requires both to be null.

* **settings** — a single row (enforced by a CHECK constraint), holding every user-configurable preference. No versioning, no history — this is live app config, not domain data.
  * `id` (boolean, always `true` — the singleton trick)
  * `octaveUpDisplaySymbol` (default `"^"`) — the display symbol substituted for the internally-stored `+`
  * Seven font-size fields (`fontSizeSm`, `fontSizeMd`, `fontSizeLg`, `fontSizeXl`, `fontSizeHeading`, `fontSizeNavBrand`, `fontSizeNavLink`) — always populated, CSS length strings
  * Six nullable button-color overrides (`btnPrimaryBackground`, `btnPrimaryColor`, `btnSecondaryBackground`, `btnSecondaryColor`, `btnDangerBackground`, `btnDangerColor`) — `NULL` = keep the automatic light/dark default; a hex string pins that color regardless of theme

---

## How the pieces fit together

- A song's **identity** (title) is `song_group`; its **content at a point in time** (key, transpose, instrument, notes, sheet) is a `song` row. Editing "everywhere going forward" updates `song_group.title` directly if title changed, and/or adds a new `song` row (pointing future/unplayed events at it — past or locked events keep pointing at whatever row they already had) if any of the other five fields changed. A title-only edit never touches versioning at all.
- An event's tracklist is just an ordered list of `track_list_song` rows. Reading one back resolves each song entry's displayed title as `overrideTitle ?? songGroup.title`, and the other five fields as `override_<field> ?? song.<field>`; spacer entries pass through with no fields to resolve.
- Nothing in this schema is ever truly deleted except a single `track_list_song` row (removing one song/spacer from one event's list) — `song_group`, `song`, and `event` rows persist forever, hidden via `archived` when no longer wanted.
