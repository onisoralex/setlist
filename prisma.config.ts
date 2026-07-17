import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma 7 moved the CLI's connection string out of schema.prisma's datasource block.
// Migrations need a direct (unpooled) connection -- Neon's pgbouncer pooler doesn't support
// the session-level features `prisma migrate` relies on. Runtime queries use the pooled
// DATABASE_URL instead (see lib/prisma.ts), matching docs/architecture.md's env var split.
//
// `prisma generate` loads this same config file but never opens a connection -- it only
// reads schema.prisma and writes generated client code. The strict `env()` helper throws
// if the var isn't resolvable at config-load time, which crashed Vercel's `postinstall`
// (`prisma generate`) when DIRECT_DATABASE_URL wasn't yet visible during `npm install`,
// even though generate never uses it. Falling back to a placeholder keeps generate immune
// to that timing issue; migrate/seed still need the real value and will fail with their
// own clear Postgres connection error if the placeholder ever reaches them for real --
// which only happens if the var is genuinely missing, a real misconfiguration that should
// surface anyway.
const directDatabaseUrl =
  process.env.DIRECT_DATABASE_URL ?? "postgresql://placeholder:placeholder@localhost:5432/placeholder";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: directDatabaseUrl,
  },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
