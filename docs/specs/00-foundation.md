# Spec 00 — Foundation (Phase 0-4)

**Status:** Ready to implement
**Date:** 2026-07-05
**Produced by:** Mind, synthesizing Tech Specialist assessment (`C:\hive\projects\setlist\workspace\tech-specialist\tech-assessment-20260705-180547\spec.md`) and user decisions (`C:\hive\projects\setlist\mind\decisions.md`)
**Depends on:** Nothing — this is the whole app for v1.

---

## Overview

`setlist` stores a bass player's song repertoire (key, transpose, instrument, freeform notes, full Nashville-number chord sheet) and the setlists ("events") built from those songs. The central design constraint is **historization**: editing a song's master data must never silently change what a past or already-frozen setlist says that song was. Two distinct edit paths exist — "change everywhere going forward" (creates a new immutable song version) and "change for this event only" (a per-event override that never touches the master song). This spec covers the full v1 build: data model, API, business logic, screens, and local dev setup.

---

## 1. Data Models

```sql
-- Stable identity for a song across all its edited versions.
-- Deliberately has NO reference to a specific `song` row (no "current_song_id"
-- pointer) -- keeping this table dumb avoids a circular FK between song_group
-- and song. "Current version" is derived via MAX(version), not stored.
-- `title` lives here, not on `song`: it's the song's stable identity, not
-- versioned data -- it doesn't change over time the way key/instrument/song
-- structure do, so editing it is a plain update, never a version bump.
CREATE TABLE song_group (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  archived    boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Immutable, append-only version rows. A "change everywhere going forward"
-- edit ALWAYS inserts a new row here -- it never UPDATEs an existing one.
-- "Current version" for a song_group = the row with MAX(version) for that
-- song_group_id (compute at query time; do not cache/store it).
CREATE TABLE song (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  song_group_id uuid NOT NULL REFERENCES song_group(id) ON DELETE RESTRICT,
  version       integer NOT NULL,             -- 1, 2, 3... monotonic per group
  key           text NOT NULL,                -- free text: tolerates mid-song key changes, e.g. "D# (+3)"
  transpose     text NOT NULL,                -- free text, signed semitone offset from C, e.g. "+3"
  instrument    text NOT NULL,                -- e.g. "synth -> bass after bridge"
  notes         text NULL,                    -- optional third line: freeform / Nashville-number shorthand
  sheet         text NULL,                    -- full chord sheet, markdown-ish, "+" marks octave-up (see settings)
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (song_group_id, version)
);

CREATE TYPE event_status AS ENUM ('draft', 'scheduled', 'played');
CREATE TYPE event_type   AS ENUM ('sunday_morning', 'sunday_evening', 'other');

CREATE TABLE event (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date        date NOT NULL,
  type        event_type NOT NULL,
  status      event_status NOT NULL DEFAULT 'draft',
  locked_at   timestamptz NULL,               -- manual freeze, independent of status (see §3)
  archived    boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- One row per song placed on an event's setlist.
CREATE TYPE track_list_entry_type AS ENUM ('song', 'spacer');

CREATE TABLE track_list_song (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id            uuid NOT NULL REFERENCES event(id) ON DELETE CASCADE,
  entry_type          track_list_entry_type NOT NULL DEFAULT 'song',
  -- Only populated when entry_type = 'song'; NULL for a 'spacer' (blank-line) entry. A spacer
  -- is a first-class, independently reorderable row -- not an attribute glued to a song -- so
  -- the user can add one via its own action and move it with the same up/down controls as a
  -- song, addressing the earlier design where a blank line could only be "before" a specific
  -- song and couldn't exist or move on its own.
  song_group_id       uuid REFERENCES song_group(id) ON DELETE RESTRICT,
  song_id             uuid REFERENCES song(id) ON DELETE RESTRICT, -- exact version this event was built against, when entry_type = 'song'
  position            integer NOT NULL,        -- ordering within the event, 0-based; songs and spacers share one position sequence

  -- Nullable overrides. NULL = inherit from `song_id`'s row. Non-null
  -- (INCLUDING an empty string) = explicit override for this event only.
  -- The API must distinguish "field omitted" (no change) from "field sent
  -- as null" (clear the override) from "field sent as ''" (override to
  -- empty string) -- see §2 and §6.
  override_title       text NULL,
  override_key         text NULL,
  override_transpose   text NULL,
  override_instrument  text NULL,
  override_notes       text NULL,
  override_sheet       text NULL,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, position),
  -- Enforces the entry_type/song-reference consistency the app relies on (added by hand in the
  -- migration -- Prisma's schema DSL cannot express a conditional CHECK like this).
  CONSTRAINT track_list_song_entry_consistency CHECK (
    (entry_type = 'song' AND song_group_id IS NOT NULL AND song_id IS NOT NULL) OR
    (entry_type = 'spacer' AND song_group_id IS NULL AND song_id IS NULL)
  )
);

-- Singleton settings row (the CHECK constraint enforces exactly one row).
CREATE TABLE settings (
  id                        boolean PRIMARY KEY DEFAULT true CHECK (id),
  octave_up_display_symbol  text NOT NULL DEFAULT '^'
);
```

Foreign key behavior: `song_group` and `song` use `ON DELETE RESTRICT` because they are never hard-deleted in the app (see §6 "Delete policy") — RESTRICT is a backstop, not the primary safeguard. `track_list_song.event_id` cascades because deleting an event's own row is the one legitimate cascade (its tracklist rows have no meaning without it) — but note events themselves are archived, not deleted, in the UI (see §6).

---

## 2. API Endpoints

REST, JSON, no auth (single-user, never exposed publicly). All routes under `/api`.

**Songs**
- `GET /api/songs` — list song groups, each showing its current version's summary fields (title, key, transpose, instrument). Excludes archived by default; `?includeArchived=true` to include them.
- `GET /api/songs/:groupId` — current version's full detail (including `sheet`) + a list of all past versions (id, version, created_at) for history browsing.
- `GET /api/songs/:groupId/versions/:version` — a specific historical version, read-only.
- `POST /api/songs` — create a new song. Creates one `song_group` row + one `song` row (version 1) in a transaction.
- `PATCH /api/songs/:groupId` — updates `title` directly on `song_group` if present in the body, and/or runs the "change everywhere going forward" version-bump flow (§3) for any of `key`/`transpose`/`instrument`/`notes`/`sheet` present in the body — both in one transaction. Omitted versioned fields carry forward from the current version; a title-only request never touches versioning at all.
- `PATCH /api/songs/:groupId/archive` — set/unset `song_group.archived`. This is the delete affordance (see §6) — there is no `DELETE /api/songs/:groupId`.

**Events**
- `GET /api/events` — list events, filterable by `?status=` and `?from=`/`?to=` date range. Excludes archived by default; `?includeArchived=true` to include them.
- `GET /api/events/:id` — event detail with its ordered `track_list_song` rows, each pre-resolved (override ?? current-version-at-add-time value) into the display fields the frontend needs — do not make the frontend do override-resolution.
- `POST /api/events` — create an event (date, type; status defaults to `draft`).
- `PATCH /api/events/:id` — edit event metadata (date, type) and/or advance `status`. Status transitions are one-directional in the UI (`draft -> scheduled -> played`) but the API does not need to enforce ordering strictly beyond validating it's one of the three enum values — see §3 for why status changes are always an explicit user action, never automatic.
- `PATCH /api/events/:id/lock` — set `locked_at` to now (or `null` to unlock).
- `PATCH /api/events/:id/archive` — set/unset `event.archived`. This is the delete affordance (see §6) — there is no `DELETE /api/events/:id`.

**Event-song (tracklist) management**
- `POST /api/events/:id/songs` — add an entry to an event's tracklist. Two shapes: `{ songGroupId }` (default, `entryType: "song"`) resolves that group's *current* version at add-time and stores it as `track_list_song.song_id` (a snapshot — if the song is later versioned "forward," this row is auto-bumped per §3, but only if the event is still eligible); `{ entryType: "spacer" }` adds a blank-line entry with no song reference. Both append at the next `position`.
- `DELETE /api/events/:id/songs/:trackListSongId` — remove an entry (song or spacer) from an event's tracklist. This is a genuine hard delete (of the join row only, not of the song or event) — re-numbers `position` for the remaining rows.
- `PATCH /api/events/:id/songs/reorder` — bulk reorder. Body: ordered array of `trackListSongId`s (songs and spacers share one position sequence, reordered together); rewrites `position` for all of them in one transaction.
- `PATCH /api/events/:id/songs/:trackListSongId/overrides` — set one or more `override_*` fields ("change for this event only") on a song entry. Request body fields follow tri-state semantics: a field **absent** from the body = don't touch it; a field present with value `null` = clear that override (revert to inheriting from the song version); a field present with a string value (including `""`) = set that override. This is exactly why the underlying HTTP method is `PATCH` with a partial body, not `PUT`. Not meaningful for a spacer entry; the frontend doesn't offer this action for spacer rows.

**Settings**
- `GET /api/settings`
- `PATCH /api/settings` — update `octave_up_display_symbol`.

**Display-layer note:** `sheet` fields always come back from the API with the raw internal symbol (`+` for octave-up) — never pre-substituted server-side. The swap to the user's configured display symbol happens in a client-side rendering function, fed by `GET /api/settings`. Keeping this out of the API means the stored format and the API contract never change if the display preference changes.

---

## 3. Business Logic

### 3.1 "Change everywhere going forward" (song version bump)

Triggered by `PATCH /api/songs/:groupId`, which handles two independent writes in one transaction, depending on what the request body contains:

- If the body includes `title`, it's a plain `UPDATE song_group SET title = ...` — `title` lives on `song_group` (§1), not `song`, so this never touches versioning at all.
- If the body includes any of `key`/`transpose`/`instrument`/`notes`/`sheet`, the version-bump flow below runs:
  1. Look up the current version: `song` row with `song_group_id = :groupId` and `MAX(version)`.
  2. Insert a new `song` row: same `song_group_id`, `version = current.version + 1`, field values = current version's values merged with whatever of those five fields the request body supplied.
  3. Find every `track_list_song` row where `song_group_id = :groupId` AND its parent `event.status IN ('draft', 'scheduled')` AND `event.locked_at IS NULL`. Update each of those rows' `song_id` to the newly inserted version's id.
  4. Rows belonging to `played` events, or to any event with `locked_at` set (regardless of status), are left untouched — they keep pointing at the old version. This is what guarantees history never silently changes.

A request can include both `title` and one or more of the five versioned fields — both writes happen, atomically, in the same transaction. A title-only request never creates a `song` row at all; there is no version to bump.

### 3.2 Event status and the locking model

An event's eligibility for auto-bump (3.1 step 3) depends on two independent things, not one:

- **`status`** — `draft` and `scheduled` are eligible; `played` never is.
- **`locked_at`** — if set, the event is frozen regardless of status. This covers the case where the user has already rehearsed from a not-yet-played event and wants it frozen early, which `status` alone cannot express.

**Status transitions are always an explicit user action** (a button in the UI, or an API call the frontend makes deliberately) — never a silent background job driven by date. Date may be used by the frontend to *suggest* "this event's date has passed, mark it played?" but the actual status write only happens when the user confirms. A cron-style silent date-driven flip would violate this project's core "never silently change history" principle applied to the event's own state.

### 3.3 Reading an event's tracklist (override resolution)

For each `track_list_song` row, for each of the six overridable fields, the resolved value the frontend receives is: `override_<field> IS NOT NULL ? override_<field> : song.<field>` (from the joined `song_id` row). This resolution happens server-side in `GET /api/events/:id` — see §2.

### 3.4 Notation display substitution

Chord sheets are stored with a single fixed internal symbol for "play one octave up": `+`. At render time, the client replaces every `+` with `settings.octave_up_display_symbol` (default `^`) before displaying. This is a pure string substitution on the client, done once per render — not stored, not part of any API response transformation.

---

## 4. External Integrations

None. No third-party APIs are called by this application.

---

## 5. Frontend Screens

- **Song list** (`/`) — desktop-oriented browse view of all non-archived song groups, showing current-version title/key/transpose/instrument. Search/filter by title. Links to song detail.
- **Song detail** (`/songs/:groupId`) — read-only view of the current version: title, key/transpose/instrument line, notes, and the full chord sheet (rendered with the display-symbol substitution, §3.4). "Edit" button navigates to the edit view — never inline-editable.
- **Song edit** (`/songs/:groupId/edit`) — form for all song fields, submitted as one combined request. Saving calls `PATCH /api/songs/:groupId`, which routes `title` to a direct `song_group` update and any of the other five fields to a version bump per §3.1 — both can happen from the same submit. There is no "per-event only" edit path from this screen; that only exists from the tracklist editor (see below).
- **Event list** (`/events`) — list of non-archived events (date, type, status). Create new event (date + type picker). Links to tracklist view.
- **Event tracklist view** (`/events/:id`) — **the primary mobile live-use screen.** Vertical scrolling list of tracklist entries in order, each either a song (showing only the essential resolved fields: title, key/transpose, instrument) or a spacer (a blank-line entry rendered as empty visual space, no text, no tap interaction). Tapping a song opens its chord sheet (resolved sheet, with display-symbol substitution applied). A per-song "edit" affordance opens a small override form for that event only. A separate "edit tracklist" entry point opens the tracklist editor.
- **Tracklist editor** (`/events/:id/edit`) — add songs via a search-as-you-type field (typing filters the song list; clicking a result adds it immediately, no separate confirm step), add a blank-line entry via a dedicated "+ Add Empty Line" action, remove any entry, reorder (up/down controls, songs and spacers share one reorderable sequence), and set/clear per-event field overrides on song entries.
- **Settings** (`/settings`) — the octave-up display symbol preference (and any other display preference added later).

---

## 6. Edge Cases

- **Distinguishing "clear override" from "set override to empty string."** Handled by the tri-state PATCH body semantics in §2 (`PATCH .../overrides`) — absent field vs. `null` vs. `""`. The frontend's override-editing UI needs an explicit "clear override" action distinct from "save an empty value," since both are valid, different states.
- **Delete policy: archive, never hard-delete.** Songs and events are never hard-deleted via the API — there is no `DELETE /api/songs/:groupId` or `DELETE /api/events/:id`. Both have an `archived` boolean, toggled via a `PATCH .../archive` endpoint, which hides them from default list views. This exists because a hard delete on a `song_group` still referenced by a past event's `track_list_song` row would either cascade-destroy history or fail on the `RESTRICT` FK — neither is acceptable given this project's historization guarantee. (The one true hard-delete in this system is removing a single song from a single event's tracklist — `DELETE /api/events/:id/songs/:trackListSongId` — which only removes a join row, not history.)
- **Adding a song to an event, then the song gets a new version before the event is played.** Per §3.1, if the event is still `draft`/`scheduled` and unlocked, its `track_list_song.song_id` is auto-bumped to the new version. Any per-event overrides on that row are untouched by the bump — they still apply on top of whichever version `song_id` now points to.
- **An event with no entries yet, or a tracklist ending in a spacer.** A spacer is a real, independent `track_list_song` row (`entryType: "spacer"`) with no song reference — not a property of an adjacent song row. A tracklist with zero entries simply renders nothing; a spacer at the very end (or the very start) is valid and not a special case requiring extra modeling.
- **Version 1 of a song has no "previous version" to diff against.** `GET /api/songs/:groupId` returning version history should handle an empty/single-entry history list gracefully — this is the default state for every newly created song, not an edge case to special-case in the UI.
- **Editing only a song's title.** Not actually an edge case once `title` lives on `song_group` (§1) — it's a plain field update, structurally no different from updating `archived`. No version is created, no diffing is needed, and there's nothing special to guard against.

---

## Module File Responsibilities

Not prescribing exact filenames — use Next.js App Router conventions (`app/api/.../route.ts` for endpoints, colocated `lib/` modules for shared logic). The one structural requirement (see repo `CLAUDE.md`): the version-bump and override-resolution logic (§3.1, §3.3) must live in a clearly named, isolated module (e.g. `lib/song-versioning.ts`), not be inlined into route handlers — it is the part of this codebase most likely to be reasoned about later.

---

## Assumptions

- Single user, no auth, no concurrent-editing conflict handling (e.g. no optimistic locking on `track_list_song` updates) — acceptable given only one person ever uses this app.
- `key`, `transpose`, and `instrument` remain free-text fields (per the user's own explicit choice) rather than structured/enumerated fields — the UI does not need dropdowns or validated formats for these.
- No image/file upload anywhere in this app (chord sheets are plain text/markdown-ish, stored as a `text` column).
- No requirement for full-text search beyond simple title matching on the song list — if the user wants richer search later, that's a future addition, not part of this spec.
