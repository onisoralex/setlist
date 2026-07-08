# setlist

A personal song-repertoire and setlist management webapp for a bass player in a church worship band. Replaces scratch notes kept outside Planning Center with a structured database of songs (key, transpose, instrument, Nashville-number chord sheets) and setlists ("events") built from them — with forward-only version history, so editing a song later never silently rewrites what a past or already-frozen setlist says it was.

**Tech stack:** Next.js (App Router) · TypeScript · PostgreSQL + Prisma · CSS Modules + custom properties · Docker (local Postgres only) · Vercel + Neon (production)

## Who it's for

A single user (the bass player). No accounts, no multi-user support, no auth — every screen and API route is open by design. If you're picking this project up, that's not an oversight to "fix," it's a deliberate scope decision (see `docs/architecture.md`).

## Goals

- Fast, mobile-first tracklist view for live use at a music stand — essential info only, tap through to the full chord sheet
- A song's key/transpose/instrument/notes/chord sheet live in one place, editable without touching Planning Center
- Editing a song "everywhere going forward" never changes what an already-played or locked setlist says that song was
- Per-event overrides ("just for this Sunday") without touching the song's master data
- Configurable notation display (e.g. octave-up symbol) and configurable UI theming (font sizes, button colors)

## Key constraints

- REST/JSON API only — no websockets, no real-time features
- No hard deletes — songs and events are archived, never destroyed, so historical setlists can never lose data out from under them
- Runs as a single Vercel deployment (frontend + API); no separate backend service

For architecture decisions, the data model, and coding conventions, see `CLAUDE.md`, `docs/architecture.md`, and `docs/specs/00-foundation.md`.

---

## System requirements

| Requirement | Notes |
|---|---|
| Docker + Docker Compose | Local Postgres only — the app itself runs directly on the host, not in a container. [Install Docker](https://docs.docker.com/engine/install/) |
| Node.js | Use `nvm` to manage versions. |
| Git | For cloning and version control. |

---

## Development

### First setup

```bash
git clone <repo-url>
cd setlist
cp .env.example .env          # default values work for local dev without changes
docker compose up -d          # starts local Postgres on host port 5433 (not 5432 -- avoids
                               # colliding with other local projects' DB containers)
npm install
npx prisma migrate dev        # applies the schema to the local DB
npx prisma db seed            # optional -- loads 4 sample songs + 1 sample event
npm run dev                   # starts Next.js with hot reload at http://localhost:3000
```

Unlike a typical Hive Docker setup, the Next.js app itself is **not** containerized for local dev — only Postgres runs in Docker. `npm run dev` on the host already gives full hot reload (Next.js Fast Refresh) with none of the bind-mount complexity a containerized app would add. See `docs/architecture.md` → "Docker / Deployment" for the reasoning.

### Routes

| URL | Purpose |
|---|---|
| `/` | Song list — browse/search the repertoire |
| `/songs/new` | Create a song |
| `/songs/:groupId` | Song detail — read-only, chord sheet with notation display applied |
| `/songs/:groupId/edit` | Edit a song (always creates a new version, applied going forward) |
| `/events` | List of setlists |
| `/events/:id` | Tracklist view — **the primary mobile live-use screen** |
| `/events/:id/edit` | Tracklist editor — add/remove/reorder songs, per-event overrides, group breaks |
| `/settings` | Notation display symbol, font sizes, button colors |
| `/api/*` | REST endpoints — see `docs/specs/00-foundation.md` §2 |

### Running the dev server

```bash
docker compose up -d     # start (or resume) the local Postgres container
docker compose down      # stop
docker compose down -v   # stop and delete the database volume
npm run dev              # start Next.js
```

### Database changes

```bash
npx prisma migrate dev --name <change-description>   # create + apply a migration locally
npx prisma studio                                      # browse the local DB in a GUI
```

Migrations always run against `DIRECT_DATABASE_URL` (unpooled), never the pooled `DATABASE_URL` — see `prisma.config.ts`. Note also that `lib/prisma.ts` uses `@prisma/adapter-pg` locally and `@prisma/adapter-neon` in production (Neon's serverless driver can't reach a plain Postgres container without an extra proxy sidecar) — this is a deliberate, documented deviation, not a bug.

### Testing

No automated test suite for v1 — this is a personal-scale project and manual verification is the primary approach (see `docs/architecture.md` → "Testing Approach"). If you add coverage later, the versioning/override resolution logic (`lib/song-versioning.ts`, `lib/track-list.ts`) is the highest-value place to start.

---

## Production deployment (Vercel + Neon)

Not yet deployed — this section describes the intended setup (see `mind/roadmap.md` in the Hive project for status).

1. Connect this repository to a Vercel project.
2. Add the Neon integration via the Vercel Marketplace — this provisions the database and automatically sets `DATABASE_URL` (pooled) and `DIRECT_DATABASE_URL` (unpooled) in the Vercel project's environment variables. Do not set these manually.
3. Deploy. `prisma migrate deploy` should run as part of the build/deploy step against `DIRECT_DATABASE_URL`.
4. Smoke test: confirm the song list loads, create a test song and event, and verify the chord sheet's notation substitution renders correctly.

---

## Documentation

- [`CLAUDE.md`](CLAUDE.md) — stack summary, dev workflow, coding conventions
- [`docs/architecture.md`](docs/architecture.md) — confirmed architecture, deviations from the Hive default stack, database/API overview
- [`docs/specs/00-foundation.md`](docs/specs/00-foundation.md) — full data model, API surface, and the versioning/override business logic
