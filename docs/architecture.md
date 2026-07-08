# Architecture

**Status:** Confirmed — see Hive project `mind/decisions.md` for full rationale on every choice below.
**Last updated:** 2026-07-05

---

## Project Type

`web-tool` — a personal, single-user song repertoire and setlist management tool. Not a SaaS product; no other users, no accounts.

## Deviation from Default Stack

Deviations from the Hive default web stack (`C:\hive\docs\tech-stack.md` §2 / "Default new web project stack"):

- **No shadcn/ui + Tailwind.** Plain CSS Modules with CSS custom properties instead. The UI surface is ~4-5 screens; a component library and a Tailwind build step add dependency weight this project doesn't need, and CSS Modules + variables already match the user's own global styling convention.
- **No Railway.** Neon Postgres is provisioned directly through the Vercel Marketplace integration — there's no separate backend service to host, so Railway has no role here.
- **No auth, billing, analytics, or ads packages.** Single user, no monetization — see "Platform Packages Used" below.

## Tech Stack (this project)

| Layer | Technology | Notes |
|---|---|---|
| Frontend | Next.js (App Router) | Also serves the REST API via Route Handlers — one deployable |
| Backend | Next.js Route Handlers | No separate Express server; REST/JSON only, no websockets |
| Database | PostgreSQL (Neon) | Provisioned via Vercel Marketplace, not a standalone Neon account |
| ORM | Prisma + `@prisma/adapter-neon` | Pooled connection for runtime queries, unpooled for migrations |
| Styling | CSS Modules + CSS custom properties | No component library (deviation, see above) |
| Auth | None | Single user, no login |
| Payments | None | Not monetized |
| Analytics | None | Not needed for a personal tool |
| Ads | None | Not applicable |
| Deployment | Vercel | Frontend + API in one deploy |
| Local dev | Docker Compose (Postgres) + `next dev` on host | See "Docker / Deployment" below |

---

## URL / Route Structure

Standalone product, not under a shared `/tools/*` path — this is a personal tool, not a public Hive product line. Top-level routes:

- `/` — song list (desktop) — browse/search the repertoire
- `/songs/:groupId` — song detail / chord sheet view
- `/songs/:groupId/edit` — song edit form (explicit edit action, separate view)
- `/events` — list of setlists (events)
- `/events/:id` — tracklist view (the primary mobile live-use screen)
- `/events/:id/edit` — tracklist editor (reorder, add/remove songs, per-event overrides)
- `/settings` — display preferences (octave-up symbol, etc.)
- `/api/*` — REST endpoints, see `docs/specs/00-foundation.md`

---

## Platform Packages Used

None. This project does not consume any `@hive/*` platform package — it has no auth, billing, analytics, ads, or shared UI/email/SEO needs.

---

## Project Folder Structure

```
app/
  api/                        Route Handlers -- REST endpoints, see docs/specs/00-foundation.md §2
    songs/route.ts                       GET (list), POST (create)
    songs/[groupId]/route.ts             GET (detail+history), PATCH (version bump)
    songs/[groupId]/versions/[version]/  GET (specific historical version)
    songs/[groupId]/archive/route.ts     PATCH (archive toggle)
    events/route.ts                      GET (list), POST (create)
    events/[id]/route.ts                 GET (detail, resolved tracklist), PATCH (metadata/status)
    events/[id]/lock/route.ts            PATCH (lock/unlock)
    events/[id]/archive/route.ts         PATCH (archive toggle)
    events/[id]/songs/route.ts           POST (add a song or a spacer/blank-line entry to tracklist)
    events/[id]/songs/[trackListSongId]/route.ts             DELETE (remove from tracklist)
    events/[id]/songs/[trackListSongId]/overrides/route.ts   PATCH (tri-state overrides, song entries only)
    events/[id]/songs/reorder/route.ts   PATCH (bulk position rewrite, songs + spacers together)
    settings/route.ts                    GET, PATCH
  page.tsx                    Song list (/)
  songs/new/page.tsx          Song create form
  songs/[groupId]/page.tsx    Song detail (read-only, chord sheet)
  songs/[groupId]/edit/page.tsx  Song edit form (always version-bumps)
  events/page.tsx             Event list
  events/[id]/page.tsx        Tracklist view -- primary mobile live-use screen
  events/[id]/edit/page.tsx   Tracklist editor (search-to-add songs, add empty lines, remove/reorder/overrides)
  settings/page.tsx           Display preferences
  layout.tsx, globals.css     Root layout and CSS custom property definitions

components/
  SongForm.tsx                 Shared form for song create + edit screens
  DateField.tsx                 Custom Monday-first calendar popup (native <input type="date"> can't
                                be forced into German conventions across browsers, see decisions.md
                                "custom-date-picker")

lib/
  prisma.ts                    PrismaClient singleton -- Neon adapter in prod, pg adapter in local dev (see below)
  song-versioning.ts            "Change everywhere going forward" (spec §3.1) for the five
                                versioned fields only -- title lives on song_group, handled
                                separately in the route -- isolated per repo CLAUDE.md
  track-list.ts                 Override resolution (song entries) + spacer-entry pass-through +
                                tri-state PATCH body parsing (spec §3.3, §6)
  notation.ts                   Client-side "+" -> display-symbol substitution (spec §3.4)
  date-format.ts                 Shared zero-padded German date/datetime formatters
  settings.ts                    Tri-state validation for theme settings (font sizes, button colors)
  api-client.ts                 Thin fetch wrapper for client components
  api-response.ts               Shared JSON error helpers for route handlers
  types.ts                      Shared TS types for API response shapes

prisma/
  schema.prisma                Data model (spec §1)
  seed.ts                      Seed script (4 songs + 1 event)
  migrations/                  Includes a hand-written migration for the settings singleton
                                CHECK constraint, which Prisma's schema DSL cannot express

generated/prisma/              Prisma 7 generated client output (gitignored, regenerated via
                                `prisma generate` / `prisma migrate dev`)
```

**Local dev Prisma adapter note (deviation from the plan, see below):** `lib/prisma.ts`
branches on `NODE_ENV` -- production uses `@prisma/adapter-neon` against the real Neon
endpoint, but local dev uses `@prisma/adapter-pg` (the plain `pg` driver) against the Docker
Postgres container instead. Neon's serverless/WebSocket driver only works against a real Neon
endpoint or a `wsproxy` sidecar container; introducing that sidecar would have added exactly
the local-dev Docker complexity this project's architecture deliberately avoided (see "Docker
/ Deployment" below), so the two-adapter branch was the smaller deviation. Both adapters
implement the same Prisma driver-adapter interface, so this is a one-line branch in one file,
invisible to every route handler and lib module.

---

## Database Overview

Five tables. Full DDL and rationale in `docs/specs/00-foundation.md` and the Hive project's `mind/decisions.md`.

- `song_group` — stable identity for a song across all its edited versions, and the home for `title` (a label, not versioned data — see `decisions.md` "title-moved-to-song-group"). No back-pointer to a specific `song` row (avoids a circular FK); "current version" is derived at query time.
- `song` — immutable, append-only version rows (key, transpose, instrument, notes, chord sheet — no `title`, that's on `song_group`).
- `event` — a setlist: date, service type, `status` (`draft`/`scheduled`/`played`), optional manual `locked_at` freeze.
- `track_list_song` — one row per tracklist entry on an event: either a song (referencing a specific `song` version, with nullable per-field overrides for "this event only" edits) or a spacer/blank-line entry (`entryType`, no song reference) — both share one reorderable position sequence.
- `settings` — single-row table for display preferences (e.g. the octave-up symbol).

## API Design

REST/JSON under `/api/*`. Full endpoint list in `docs/specs/00-foundation.md` §2. No auth — every endpoint is open (this app is never exposed beyond the user's own devices/browser).

---

## Monetization Model

None. See `docs/monetization.md`.

---

## Testing Approach

- Manual testing is the primary verification method for this personal-scale project — no automated test suite is required for v1.
- If the Developer or user wants coverage on the versioning/override resolution logic specifically (the trickiest part of the domain), Vitest unit tests on that logic are welcome but not mandated.

---

## Docker / Deployment

**Local dev:**
- `docker-compose.yml` runs a single `db` service (`postgres:16-alpine`) — a local stand-in for Neon.
- The Next.js app itself runs on the host via `npm run dev` (not containerized) — Next.js Fast Refresh already gives hot reload with zero Docker complexity, and this avoids Windows/Docker bind-mount file-watching issues entirely.
- `DATABASE_URL` in `.env` points at the local `db` container (`postgresql://...@localhost:5432/...`).

**Production:** Vercel (frontend + API) + Neon (via Vercel Marketplace). No Docker in production — this is not a self-hosted deployment, unlike the coffee-shop project's Raspberry Pi setup. No `docker-compose.prod.yaml` or systemd setup script is needed here.

---

## Environment Variables

| Key | Purpose | Local dev value | Production |
|---|---|---|---|
| `DATABASE_URL` | Prisma runtime connection (pooled) | Local Docker Postgres | Neon pooled connection string (set by Vercel Marketplace integration) |
| `DIRECT_DATABASE_URL` | Prisma migration connection (unpooled) | Same as `DATABASE_URL` locally (no pooler in dev) | Neon unpooled/direct connection string |
| `NODE_ENV` | Standard Node environment flag | `development` | `production` |
