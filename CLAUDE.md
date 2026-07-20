# setlist

A personal song-repertoire and setlist management webapp for a bass player in a church worship band — replaces scratch notes with a structured database of songs (key, transpose, instrument, chord sheet) and setlists ("events") built from them, with forward-only version history.

## Tech stack

- **Next.js (App Router)** — frontend + REST API (Route Handlers) in one deployable.
- **PostgreSQL via Neon** (connected manually in Vercel's env vars — set up directly through Neon's own signup, not the Vercel Marketplace integration; functionally identical either way).
- **Prisma** ORM with `@prisma/adapter-neon`.
- **MUI (`@mui/material` + Emotion)** — base component library (buttons, dialogs, form inputs, autocomplete, chips) as of Phase 7. Uses `@mui/material-nextjs`'s `v16-appRouter` entry point specifically — the `v15-appRouter` one breaks on this repo's Next.js 16 (stricter Server/Client boundary checks; see `components/MuiThemeProvider.tsx`).
- **CSS Modules + CSS custom properties** — the pre-existing settings-driven theming layer (font sizes, button colors, page background, spacer height). MUI is additive on top of this, not a replacement — see `mui-adoption` in the Hive project's `decisions.md`.
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
5. `npx prisma db seed` — optional, loads 4 sample songs (one with German/English names) + 2 events, one `draft` and one `played`+locked to demonstrate version-locking (run once, or after resetting the DB).
6. `npm run dev` — starts Next.js with hot reload (Fast Refresh) at `http://localhost:3000`. The app is gated behind `SITE_PASSWORD` (from `.env`) — the first thing you'll see is the login page, not the song list.

**Prisma adapter note:** `lib/prisma.ts` uses `@prisma/adapter-pg` for local dev and `@prisma/adapter-neon` in production — see `docs/architecture.md` "Project Folder Structure" for why (Neon's serverless driver can't reach a plain Postgres container without an extra proxy sidecar). Migrations always run against `DIRECT_DATABASE_URL` regardless of environment (`prisma.config.ts`).

## Coding conventions

- Follow the global CLAUDE.md defaults (double quotes, template literals, arrow functions, CSS custom properties for repeated values).
- The song-versioning/override resolution logic (`docs/specs/00-foundation.md` §3) is the trickiest part of this codebase — keep it isolated in a clearly named module rather than inlined into route handlers, since it will be read and reasoned about far more than it will be changed.
- The whole app is gated behind one shared password (`SITE_PASSWORD`), enforced in `middleware.ts` via `lib/auth.ts` — not real multi-user accounts, just a single login. Do not add further auth scaffolding "just in case."
- **MUI vs. CSS Modules load order**: MUI's Emotion-injected styles load *after* this app's CSS Modules, so a CSS Modules rule trying to override an MUI component's own styling (e.g. `margin-left: auto` on a `Button`) can silently lose the cascade. Use the `sx` prop for that kind of override instead — confirmed via a real bug (`header-mechanism-and-list-layout` task) where a CSS Modules `margin-left: auto` was silently overridden until switched to `sx={{ marginLeft: "auto" }}`.
- **MUI `CssBaseline` vs. the page-background setting**: `CssBaseline` sets its own `body { background-color: ... }` from `theme.palette.background.default`, which will silently win over this app's own `body { background: var(--page-background) }` unless the theme's `palette.background.default` is itself pointed at `var(--page-background)` (see `components/MuiThemeProvider.tsx`) — a real bug found and fixed during the Phase E search/settings work.
- **Nav header title**: the nav's title slot is dynamic per-page, not a static "setlist" brand — any new page should call `useSetHeaderTitle(node)` (`components/HeaderTitleProvider.tsx`) to set it; the hook accepts a `ReactNode`, not just a string, since the event detail page renders mixed font sizes (date + status) in that slot.
- **`prisma.config.ts`'s datasource `url`** reads `process.env.DIRECT_DATABASE_URL` directly with a placeholder fallback, not the strict `env()` helper from `prisma/config` — `env()` throws if the var isn't resolvable, which crashed `npm install`'s `postinstall: prisma generate` on Vercel even though `generate` never needs a real DB connection. See `prisma-config-generate-fallback` in the Hive project's `decisions.md` before "fixing" this back to `env()`.

## Deployment

- Production: `https://setlist.hivefoundry.app` (Cloudflare CNAME → Vercel). Deploys off `main` via GitHub import.
- `DATABASE_URL`, `DIRECT_DATABASE_URL`, and `SITE_PASSWORD` must be set in Vercel's project environment variables — none of these are inferred or auto-provisioned, they were set by hand.
- The `build` script is `prisma migrate deploy && next build`, not just `next build` — every deploy applies any pending migrations before building, so a database reset or a fresh database with the same connection strings self-heals on the next deploy. Never bake `prisma db seed` into this — seed data must never run against production automatically.
- To run a migration without a full deploy: `npx vercel link`, `npx vercel env pull .env.production.local --environment=production`, then `DOTENV_CONFIG_PATH=.env.production.local npx prisma migrate deploy` (delete that file afterward — it has real credentials).

## Key files

- `docs/architecture.md` — confirmed stack, deviations from Hive defaults, DB/API overview.
- `docs/specs/00-foundation.md` — full data model, API surface, and the versioning business logic a Developer needs to implement without guessing.
- `docs/monetization.md` — not applicable to this project (personal tool).
