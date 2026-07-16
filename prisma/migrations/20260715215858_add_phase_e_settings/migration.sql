-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "background_color" TEXT,
ADD COLUMN     "search_scope_chords" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "search_scope_instrument" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "search_scope_key" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "search_scope_name" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "search_scope_notes" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "spacer_height" TEXT NOT NULL DEFAULT '2.5rem';
