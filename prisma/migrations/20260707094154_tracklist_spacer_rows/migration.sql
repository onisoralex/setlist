/*
  Warnings:

  - You are about to drop the column `group_break_before` on the `track_list_song` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "track_list_entry_type" AS ENUM ('song', 'spacer');

-- AlterTable
ALTER TABLE "track_list_song" DROP COLUMN "group_break_before",
ADD COLUMN     "entry_type" "track_list_entry_type" NOT NULL DEFAULT 'song',
ALTER COLUMN "song_group_id" DROP NOT NULL,
ALTER COLUMN "song_id" DROP NOT NULL;

-- Enforces that song fields are populated iff this is a song row, and NULL iff it's a spacer
-- row (spec: spacers are independent entries, not an attribute on a song). Prisma's schema DSL
-- has no way to express an arbitrary CHECK constraint, so this is added by hand -- same pattern
-- as the settings singleton CHECK in 20260705201050_settings_singleton_check.
ALTER TABLE "track_list_song" ADD CONSTRAINT "track_list_song_entry_consistency" CHECK (
  (entry_type = 'song' AND song_group_id IS NOT NULL AND song_id IS NOT NULL) OR
  (entry_type = 'spacer' AND song_group_id IS NULL AND song_id IS NULL)
);
