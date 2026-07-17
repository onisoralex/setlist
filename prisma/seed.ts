import { prisma } from "../lib/prisma";

// Small, real-looking dataset so the app isn't empty on first run -- not meant to be
// exhaustive, just enough to exercise every screen (list, detail, tracklist, overrides).
const SONGS = [
  {
    title: "10,000 Reasons (Bless the Lord)",
    // Demonstrates formatSongDisplayName's "romanian | german | english" join (the other three
    // songs deliberately leave these null/unset -- that's the far more common case).
    titleDe: "Zehntausend Gründe",
    titleEn: "10,000 Reasons",
    key: "E",
    transpose: "+0",
    instrument: "bass",
    notes: "Standard arrangement, watch the key change on the bridge.",
    sheet: "Verse: E B C#m A\nChorus: E B C#m A\nBridge (+ ): A E F#m B",
  },
  {
    title: "What A Beautiful Name",
    key: "D",
    transpose: "+0",
    instrument: "bass",
    notes: null,
    sheet: "Verse: D A/C# Bm G\nChorus: G D/F# Em7 A\nBridge: Bm A G D",
  },
  {
    title: "Goodness of God",
    key: "A",
    transpose: "-2",
    instrument: "synth -> bass after bridge",
    notes: "Transposed down for the vocalist this quarter.",
    sheet: "Verse: A E F#m D\nChorus: A E F#m D\nBridge (+ octave on last chorus): D A E F#m",
  },
  {
    title: "Build My Life",
    key: "G",
    transpose: "+0",
    instrument: "bass",
    notes: "Nashville numbers work fine here: 1 5 6m 4.",
    sheet: "Verse: G D Em C\nChorus: G D Em C\nBridge: Em C G D",
  },
];

const seed = async () => {
  console.log("Seeding songs...");
  const songGroups = [];
  for (const { title, titleDe, titleEn, ...songFields } of SONGS) {
    const group = await prisma.songGroup.create({
      data: {
        title,
        titleDe: titleDe ?? null,
        titleEn: titleEn ?? null,
        songs: {
          create: { version: 1, ...songFields },
        },
      },
      include: { songs: true },
    });
    songGroups.push(group);
    console.log(`  created "${title}"`);
  }

  console.log("Seeding an event...");
  // A spacer entry before the third song (e.g. announcements) -- own row, own position, not an
  // attribute of the song next to it.
  const trackListEntries = songGroups.flatMap((group, index) =>
    index === 2
      ? [{ entryType: "spacer" as const }, { songGroupId: group.id, songId: group.songs[0].id }]
      : [{ songGroupId: group.id, songId: group.songs[0].id }],
  );
  const event = await prisma.event.create({
    data: {
      date: new Date(),
      type: "sunday_morning",
      trackListSongs: {
        create: trackListEntries.map((entry, position) => ({ ...entry, position })),
      },
    },
  });
  console.log(`  created event ${event.id} with ${songGroups.length} songs`);

  console.log("Seeding a second, played+locked event...");
  // Reuses the first two song groups' current version rather than creating new songs -- this
  // event exists to exercise status/lock semantics (spec 00-foundation.md §3.2), not to add
  // more repertoire. lockedAt set alongside status "played" since in real use a played event is
  // the case that actually gets manually frozen.
  const pastEvent = await prisma.event.create({
    data: {
      date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      type: "sunday_evening",
      status: "played",
      lockedAt: new Date(),
      trackListSongs: {
        create: songGroups.slice(0, 2).map((group, position) => ({
          songGroupId: group.id,
          songId: group.songs[0].id,
          position,
        })),
      },
    },
  });
  console.log(`  created event ${pastEvent.id} (played, locked)`);

  console.log("Seeding settings...");
  await prisma.settings.upsert({
    where: { id: true },
    update: {},
    create: { id: true },
  });

  console.log("Done.");
};

seed()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
