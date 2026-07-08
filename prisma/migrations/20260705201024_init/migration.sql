-- CreateEnum
CREATE TYPE "event_status" AS ENUM ('draft', 'scheduled', 'played');

-- CreateEnum
CREATE TYPE "event_type" AS ENUM ('sunday_morning', 'sunday_evening', 'other');

-- CreateTable
CREATE TABLE "song_group" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "song_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "song" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "song_group_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "transpose" TEXT NOT NULL,
    "instrument" TEXT NOT NULL,
    "notes" TEXT,
    "sheet" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "song_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "date" DATE NOT NULL,
    "type" "event_type" NOT NULL,
    "status" "event_status" NOT NULL DEFAULT 'draft',
    "locked_at" TIMESTAMPTZ,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "track_list_song" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "song_group_id" UUID NOT NULL,
    "song_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "group_break_before" BOOLEAN NOT NULL DEFAULT false,
    "override_title" TEXT,
    "override_key" TEXT,
    "override_transpose" TEXT,
    "override_instrument" TEXT,
    "override_notes" TEXT,
    "override_sheet" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "track_list_song_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" BOOLEAN NOT NULL DEFAULT true,
    "octave_up_display_symbol" TEXT NOT NULL DEFAULT '^',

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "song_song_group_id_version_key" ON "song"("song_group_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "track_list_song_event_id_position_key" ON "track_list_song"("event_id", "position");

-- AddForeignKey
ALTER TABLE "song" ADD CONSTRAINT "song_song_group_id_fkey" FOREIGN KEY ("song_group_id") REFERENCES "song_group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "track_list_song" ADD CONSTRAINT "track_list_song_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "track_list_song" ADD CONSTRAINT "track_list_song_song_group_id_fkey" FOREIGN KEY ("song_group_id") REFERENCES "song_group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "track_list_song" ADD CONSTRAINT "track_list_song_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "song"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
