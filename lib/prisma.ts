import { PrismaClient } from "../generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

// Neon's serverless driver needs a WebSocket implementation in Node's server runtime (Vercel
// functions run on Node, not Workers/edge, so there's no trustworthy global WebSocket to
// rely on) -- wiring in `ws` here only matters for the production/Neon branch below, but it's
// cheap to set unconditionally since PrismaPg (the local dev branch) simply ignores it.
neonConfig.webSocketConstructor = ws;

// Standard Next.js dev-mode singleton: Fast Refresh re-evaluates this module on every
// edit, which would otherwise open a fresh pool per reload and exhaust connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Neon's serverless driver (@neondatabase/serverless / @prisma/adapter-neon) talks to
// Postgres over a WebSocket proxy that only exists in front of real Neon endpoints -- it
// cannot reach a plain `postgres:16-alpine` container without also standing up Neon's
// `wsproxy` sidecar, which docs/architecture.md's local dev setup (a single `db` service)
// deliberately doesn't include. So: use the plain `pg` driver adapter against local Docker
// Postgres, and only switch to the Neon adapter in production against the real Neon
// endpoint. Both are Prisma driver adapters with the same PrismaClient({ adapter }) shape,
// so this is a one-time branch here, not something route handlers or lib modules need to
// know about.
const createPrismaClient = () => {
  const adapter =
    process.env.NODE_ENV === "production"
      ? new PrismaNeon({ connectionString: process.env.DATABASE_URL })
      : new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
