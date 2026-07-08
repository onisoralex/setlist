-- Enforces the "exactly one settings row" invariant from spec 00-foundation.md §1.
-- Prisma's schema DSL has no way to express an arbitrary CHECK constraint, so this is
-- added by hand. A boolean PK alone only prevents two rows with the same value; without
-- this CHECK, a second row with id = false would still be legal and break the singleton
-- assumption every settings read/write in this app relies on.
ALTER TABLE "settings" ADD CONSTRAINT "settings_id_check" CHECK ("id");