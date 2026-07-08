/*
  Warnings:

  - You are about to drop the column `title` on the `song` table. All the data in the column
    will be lost -- but only after being copied to `song_group.title` by the backfill step
    below, so no actual title data is lost.
  - Added the required column `title` to the `song_group` table.

  This migration is hand-sequenced (expand-backfill-contract) rather than Prisma-generated,
  because `title` is moving from `song` (versioned rows) to `song_group` (stable identity) and
  the existing rows in both tables must survive the move with their data intact:

    1. Expand: add `song_group.title` as nullable so existing rows don't fail a NOT NULL check.
    2. Backfill: copy each group's title from its current (highest-version) `song` row.
    3. Contract: make `song_group.title` NOT NULL now that every row has a value, then drop
       `song.title` since it's no longer needed there.
*/

-- Expand
ALTER TABLE "song_group" ADD COLUMN "title" TEXT;

-- Backfill: each group's title comes from its current (highest-version) song row.
UPDATE "song_group" sg
SET "title" = (
  SELECT s."title" FROM "song" s
  WHERE s."song_group_id" = sg.id
  ORDER BY s."version" DESC
  LIMIT 1
);

-- Contract
ALTER TABLE "song_group" ALTER COLUMN "title" SET NOT NULL;
ALTER TABLE "song" DROP COLUMN "title";
