# setlist

A personal song-repertoire and setlist management webapp for a bass player in a church worship band. Replaces scratch notes kept outside Planning Center with a structured database of songs (key, transpose, instrument, Nashville-number chord sheets) and setlists ("events") built from them — with forward-only version history, so editing a song later never silently rewrites what a past or already-frozen setlist says it was.

**Tech stack:** Next.js (App Router) · TypeScript · PostgreSQL + Prisma · MUI (Material UI) + Emotion · CSS Modules + custom properties · Docker (local Postgres only) · Vercel + Neon (production)

## Who it's for

A single user (the bass player). No accounts, no real multi-user support — just one person's repertoire and setlists. Since the app moved off localhost-only access, it's gated behind one shared password (`SITE_PASSWORD`), enforced in `middleware.ts` via `lib/auth.ts`, with Postgres-backed brute-force protection on login attempts (see the `LoginAttempt` model in `prisma/schema.prisma`). That's a single shared secret, not real per-user accounts — if you're picking this project up, the lack of proper multi-user auth is a deliberate scope decision, not an oversight to "fix" (see `docs/architecture.md`).

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
npx prisma db seed            # optional -- loads 4 sample songs (one with German/English name
                               # variants) + 2 sample events (one draft, one played and locked)
npm run dev                   # starts Next.js with hot reload at http://localhost:3000
```

The app is gated behind `SITE_PASSWORD` (see "Who it's for" above), so the first thing you'll hit at `http://localhost:3000` is the `/login` screen, not the song list — log in with whatever you set `SITE_PASSWORD` to in `.env` (the `.env.example` default, `dev-password`, works out of the box).

Unlike a typical Hive Docker setup, the Next.js app itself is **not** containerized for local dev — only Postgres runs in Docker. `npm run dev` on the host already gives full hot reload (Next.js Fast Refresh) with none of the bind-mount complexity a containerized app would add. See `docs/architecture.md` → "Docker / Deployment" for the reasoning.

### Routes

| URL | Purpose |
|---|---|
| `/login` | Shared-password login screen — you're redirected here if you don't have a valid auth cookie |
| `/` | Redirects to `/songs` |
| `/songs` | Song list — search (scoped via toggle chips: name, notes, instrument, key, chords), sort (name / key alphabetical / key chromatic), create/rename/edit songs via modals |
| `/songs/new` | Renders the song list's "New Song" modal pre-opened over `/songs` — kept as its own route so a bookmarked/deep link still works; Cancel/Create both land back on `/songs` |
| `/songs/:groupId` | Song detail — read-only, chord sheet with notation display applied, version history if more than one version exists |
| `/songs/:groupId/edit` | Renders the song detail page's edit modal (`EditSongModal`) pre-opened over `/songs/:groupId` — kept as its own route for bookmarked/deep links, not a full-page editor; always creates a new version, applied going forward |
| `/events` | List of setlists — create new events, soft-delete (archive) existing ones |
| `/events/:id` | Tracklist view — **the primary mobile live-use screen**; also where you edit event metadata, lock/unlock, and change status (draft/scheduled/played) |
| `/events/:id/edit` | Renders the event page's tracklist editor modal (`TracklistEditModal`) pre-opened over `/events/:id` — kept as its own route for bookmarked/deep links, not a full-page editor; add/remove/reorder songs and spacers ("blank line" group breaks), per-event overrides |
| `/settings` | Notation display symbol, font sizes, blank-line (spacer) height, page background and button colors, log out |
| `/api/*` | REST endpoints — see `docs/specs/00-foundation.md` §2 |

### Running the dev server

```bash
docker compose up -d     # start (or resume) the local Postgres container
npm run dev              # start Next.js
```

### Stopping the dev server

```bash
docker compose down      # stop
docker compose down -v   # stop and delete the database volume
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

Live at `https://setlist.hivefoundry.app` — Vercel (frontend + API) + Neon (Postgres), with a custom domain via a Cloudflare CNAME (the domain is already on Cloudflare). Deploys off `main` via GitHub import.

- **Database:** the Neon project was created directly through Neon's own signup, not the Vercel Marketplace integration — functionally identical, it just means `DATABASE_URL` (pooled) and `DIRECT_DATABASE_URL` (unpooled) are **not** auto-provisioned by Vercel.
- **Environment variables:** `DATABASE_URL`, `DIRECT_DATABASE_URL`, and `SITE_PASSWORD` are all set by hand in Vercel's project environment variables — nothing here is inferred or auto-injected.
- **Migrations:** the `build` script is `prisma migrate deploy && next build` (see `package.json`), not just `next build` — every deploy applies any pending migrations before building. A database reset, or a brand-new Neon database reusing the same connection strings, self-heals on the next deploy with no manual steps. `prisma db seed` is deliberately **not** part of this step — sample data must never run against production automatically.
- To run a migration without triggering a full deploy: `npx vercel link`, `npx vercel env pull .env.production.local --environment=production`, then `DOTENV_CONFIG_PATH=.env.production.local npx prisma migrate deploy` (delete that file afterward — it has real credentials).

See `docs/architecture.md` → "Docker / Deployment" for the full reasoning behind these choices.

---

## Documentation

- [`CLAUDE.md`](CLAUDE.md) — stack summary, dev workflow, coding conventions
- [`docs/architecture.md`](docs/architecture.md) — confirmed architecture, deviations from the Hive default stack, database/API overview
- [`docs/specs/00-foundation.md`](docs/specs/00-foundation.md) — full data model, API surface, and the versioning/override business logic
