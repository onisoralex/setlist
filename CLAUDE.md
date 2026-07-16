# setlist

A personal song-repertoire and setlist management webapp for a bass player in a church worship band — replaces scratch notes with a structured database of songs (key, transpose, instrument, chord sheet) and setlists ("events") built from them, with forward-only version history.

## Tech stack

- **Next.js (App Router)** — frontend + REST API (Route Handlers) in one deployable.
- **PostgreSQL via Neon** (connected manually in Vercel's env vars — set up directly through Neon's own signup, not the Vercel Marketplace integration; functionally identical either way).
- **Prisma** ORM with `@prisma/adapter-neon`.
- **CSS Modules + CSS custom properties** — no component library.
- **Vercel** for hosting (frontend + API + DB integration).
- **Docker Compose** for local Postgres only — the Next.js app itself runs via `npm run dev` on the host (see `docs/architecture.md` "Docker / Deployment" for why).

Full rationale for every choice: `docs/architecture.md` and the Hive project's `mind/decisions.md` (`C:\hive\projects\setlist\mind\decisions.md`).

## Project structure

See `docs/architecture.md` "Project Folder Structure" (filled in once scaffolded) and "URL / Route Structure" for the route map.

## Development workflow

1. `docker compose up -d` — starts local Postgres (host port **5433**, not 5432 — avoids colliding with other Hive projects' local DB containers, e.g. coffee-shop).
2. Copy `.env.example` to `.env`.
3. `npm install`
4. `npx prisma migrate dev` — applies migrations to the local DB.
5. `npx prisma db seed` — optional, loads 4 sample songs + 1 event (run once, or after resetting the DB).
6. `npm run dev` — starts Next.js with hot reload (Fast Refresh) at `http://localhost:3000`.

**Prisma adapter note:** `lib/prisma.ts` uses `@prisma/adapter-pg` for local dev and `@prisma/adapter-neon` in production — see `docs/architecture.md` "Project Folder Structure" for why (Neon's serverless driver can't reach a plain Postgres container without an extra proxy sidecar). Migrations always run against `DIRECT_DATABASE_URL` regardless of environment (`prisma.config.ts`).

## Coding conventions

- Follow the global CLAUDE.md defaults (double quotes, template literals, arrow functions, CSS custom properties for repeated values).
- The song-versioning/override resolution logic (`docs/specs/00-foundation.md` §3) is the trickiest part of this codebase — keep it isolated in a clearly named module rather than inlined into route handlers, since it will be read and reasoned about far more than it will be changed.
- The whole app is gated behind one shared password (`SITE_PASSWORD`), enforced in `middleware.ts` via `lib/auth.ts` — not real multi-user accounts, just a single login. Do not add further auth scaffolding "just in case."

## Deployment

- Production: `https://setlist.hivefoundry.app` (Cloudflare CNAME → Vercel). Deploys off `main` via GitHub import.
- `DATABASE_URL`, `DIRECT_DATABASE_URL`, and `SITE_PASSWORD` must be set in Vercel's project environment variables — none of these are inferred or auto-provisioned, they were set by hand.
- The `build` script is `prisma migrate deploy && next build`, not just `next build` — every deploy applies any pending migrations before building, so a database reset or a fresh database with the same connection strings self-heals on the next deploy. Never bake `prisma db seed` into this — seed data must never run against production automatically.
- To run a migration without a full deploy: `npx vercel link`, `npx vercel env pull .env.production.local --environment=production`, then `DOTENV_CONFIG_PATH=.env.production.local npx prisma migrate deploy` (delete that file afterward — it has real credentials).

## Key files

- `docs/architecture.md` — confirmed stack, deviations from Hive defaults, DB/API overview.
- `docs/specs/00-foundation.md` — full data model, API surface, and the versioning business logic a Developer needs to implement without guessing.
- `docs/monetization.md` — not applicable to this project (personal tool).
