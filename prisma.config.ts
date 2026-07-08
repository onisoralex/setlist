import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prisma 7 moved the CLI's connection string out of schema.prisma's datasource block.
// Migrations need a direct (unpooled) connection -- Neon's pgbouncer pooler doesn't support
// the session-level features `prisma migrate` relies on. Runtime queries use the pooled
// DATABASE_URL instead (see lib/prisma.ts), matching docs/architecture.md's env var split.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DIRECT_DATABASE_URL"),
  },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
