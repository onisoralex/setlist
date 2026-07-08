-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "btn_danger_background" TEXT,
ADD COLUMN     "btn_danger_color" TEXT,
ADD COLUMN     "btn_primary_background" TEXT,
ADD COLUMN     "btn_primary_color" TEXT,
ADD COLUMN     "btn_secondary_background" TEXT,
ADD COLUMN     "btn_secondary_color" TEXT,
ADD COLUMN     "font_size_heading" TEXT NOT NULL DEFAULT '3.5rem',
ADD COLUMN     "font_size_lg" TEXT NOT NULL DEFAULT '1.875rem',
ADD COLUMN     "font_size_md" TEXT NOT NULL DEFAULT '1.5rem',
ADD COLUMN     "font_size_nav_brand" TEXT NOT NULL DEFAULT '2.5rem',
ADD COLUMN     "font_size_nav_link" TEXT NOT NULL DEFAULT '1.75rem',
ADD COLUMN     "font_size_sm" TEXT NOT NULL DEFAULT '1.3125rem',
ADD COLUMN     "font_size_xl" TEXT NOT NULL DEFAULT '2.625rem';
